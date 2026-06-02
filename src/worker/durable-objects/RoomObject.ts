import { DurableObject } from "cloudflare:workers";
import { ROUND_RESULT_MS, ROUND_TIMEOUT_MS, VOTE_TIMEOUT_MS } from "../../game/constants";
import {
  canStartGame,
  clearPlayerConditions,
  createInitialGameState,
  getConnectedPlayerCount,
  getConnectedPlayerIds,
  refreshHost,
  toPublicGameState,
} from "../../game/state";
import type { GameState, Player, RoundAnswer, VoteState, VoteValue } from "../../game/types";
import {
  countHiraganaChars,
  normalizeAnswer,
  normalizePlayerName,
  isStructurallyValidAnswer,
  pickRandomHiragana,
} from "../../game/rules";
import { countVoteTotals, getRequiredApproveVotes, getVoteDecision } from "../../game/votes";
import { parseClientMessage, type ServerMessage } from "../../websocket/messages";
import type { SessionAttachment } from "../../websocket/sessions";
import type { Env } from "../env";

const GAME_STATE_KEY = "gameState";

export class RoomObject extends DurableObject<Env> {
  private state: GameState | null = null;
  private readonly ready: Promise<void>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ready = ctx.blockConcurrencyWhile(async () => {
      this.state = (await ctx.storage.get<GameState>(GAME_STATE_KEY)) ?? null;
      if (this.state) {
        this.migrateState();
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    const roomId = extractRoomId(new URL(request.url).pathname);
    if (!roomId) return new Response("Room not found.", { status: 404 });

    await this.ensureState(roomId);

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    const attachment: SessionAttachment = {
      playerId: null,
      sessionId: crypto.randomUUID(),
      connectedAt: Date.now(),
    };

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(attachment);
    this.sendRoomState(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    await this.ensureState();

    if (typeof message !== "string") {
      this.send(ws, { type: "error", message: "テキストメッセージのみ受け付けます。" });
      return;
    }

    let raw: unknown;
    try {
      raw = JSON.parse(message);
    } catch {
      this.send(ws, { type: "error", message: "メッセージのJSONを読み取れません。" });
      return;
    }

    const clientMessage = parseClientMessage(raw);
    if (!clientMessage) {
      this.send(ws, { type: "error", message: "未対応のメッセージです。" });
      return;
    }

    switch (clientMessage.type) {
      case "join_room":
        await this.handleJoinRoom(ws, clientMessage.name);
        return;
      case "start_game":
        await this.handleStartGame(ws);
        return;
      case "submit_answer":
        await this.handleSubmitAnswer(ws, clientMessage.word);
        return;
      case "submit_vote":
        await this.handleSubmitVote(ws, clientMessage.answerId, clientMessage.vote);
        return;
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    await this.handleDisconnect(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.handleDisconnect(ws);
  }

  async alarm(): Promise<void> {
    const state = await this.ensureState();
    const now = Date.now();
    let event: ServerMessage | null = null;

    if (state.status === "voting" && state.vote && state.vote.deadlineAt <= now) {
      event = this.rejectCurrentVote();
    } else if (state.status === "playing" && state.round && state.round.deadlineAt <= now) {
      event = this.startVoteForBestAnswer();
    } else if (
      state.status === "round_result" &&
      state.nextRoundStartsAt !== null &&
      state.nextRoundStartsAt <= now
    ) {
      if (getConnectedPlayerCount(state) >= 2) {
        this.startRound();
        event = this.createRoundStartedMessage();
      } else {
        state.status = "waiting";
        state.round = null;
        state.vote = null;
        state.nextRoundStartsAt = null;
        clearPlayerConditions(state);
      }
    }

    await this.persist();
    if (event) this.broadcast(event);
    this.broadcastRoomState();
  }

  private async handleJoinRoom(ws: WebSocket, rawName: string): Promise<void> {
    const state = await this.ensureState();
    const name = normalizePlayerName(rawName);
    if (!name) {
      this.send(ws, { type: "error", message: "名前を入力してください。" });
      return;
    }

    const attachment = this.getAttachment(ws);
    let player: Player | null = null;

    if (attachment?.playerId && state.players[attachment.playerId]) {
      player = state.players[attachment.playerId];
      player.name = name;
      player.connected = true;
    } else {
      const playerId = crypto.randomUUID();
      player = {
        id: playerId,
        name,
        score: 0,
        connected: true,
        startChar: null,
        endChar: null,
        joinedAt: Date.now(),
      };
      state.players[playerId] = player;
      ws.serializeAttachment({
        playerId,
        sessionId: attachment?.sessionId ?? crypto.randomUUID(),
        connectedAt: attachment?.connectedAt ?? Date.now(),
      } satisfies SessionAttachment);
    }

    refreshHost(state);
    this.send(ws, { type: "you_joined", playerId: player.id, name: player.name });
    await this.persist();
    this.broadcastRoomState();
  }

  private async handleStartGame(ws: WebSocket): Promise<void> {
    const state = await this.ensureState();
    const playerId = this.getAttachment(ws)?.playerId ?? null;

    if (!canStartGame(state, playerId)) {
      this.send(ws, {
        type: "error",
        message: "ホストかつ2人以上の接続中プレイヤーが必要です。",
      });
      return;
    }

    for (const player of Object.values(state.players)) {
      player.score = 0;
    }

    this.startRound();
    await this.persist();
    this.broadcast({ type: "game_started", state: toPublicGameState(state) });
    this.broadcast(this.createRoundStartedMessage());
    this.broadcastRoomState();
  }

  private async handleSubmitAnswer(ws: WebSocket, rawWord: string): Promise<void> {
    const state = await this.ensureState();
    const playerId = this.getAttachment(ws)?.playerId ?? null;

    if (!playerId || !state.players[playerId]) {
      this.send(ws, { type: "answer_rejected", reason: "not_joined" });
      return;
    }

    if (state.status === "voting") {
      this.send(ws, { type: "answer_rejected", reason: "already_voting" });
      return;
    }

    if (state.status !== "playing" || !state.round) {
      this.send(ws, { type: "answer_rejected", reason: "not_playing" });
      return;
    }

    const player = state.players[playerId];
    if (!player.startChar || !player.endChar) {
      this.send(ws, { type: "answer_rejected", reason: "no_condition" });
      return;
    }

    const word = normalizeAnswer(rawWord);
    const isValid = isStructurallyValidAnswer({
      word,
      startChar: player.startChar,
      endChar: player.endChar,
    });

    if (!isValid) {
      this.send(ws, { type: "answer_rejected", reason: "invalid_format" });
      return;
    }

    this.recordBestAnswer(playerId, word);
    await this.persist();
    this.broadcastRoomState();
  }

  private async handleSubmitVote(ws: WebSocket, answerId: string, vote: VoteValue): Promise<void> {
    const state = await this.ensureState();
    const playerId = this.getAttachment(ws)?.playerId ?? null;

    if (!playerId || !state.players[playerId]) {
      this.send(ws, { type: "error", message: "参加後に投票してください。" });
      return;
    }

    if (state.status !== "voting" || !state.vote || state.vote.answerId !== answerId) {
      this.send(ws, { type: "error", message: "投票できる回答がありません。" });
      return;
    }

    if (state.vote.answerPlayerId === playerId) {
      this.send(ws, { type: "error", message: "回答者本人は手動投票できません。" });
      return;
    }

    if (state.vote.votes[playerId]) {
      this.send(ws, { type: "error", message: "この回答には投票済みです。" });
      return;
    }

    state.vote.votes[playerId] = vote;
    const event = this.resolveVoteIfNeeded();
    const totals = state.vote ? countVoteTotals(state.vote) : null;
    await this.persist();

    if (event) {
      this.broadcast(event);
    } else if (totals) {
      this.broadcast({
        type: "vote_updated",
        answerId,
        approveVotes: totals.approve,
        rejectVotes: totals.reject,
        requiredApproveVotes: state.vote?.requiredApproveVotes ?? 0,
      });
    }

    this.broadcastRoomState();
  }

  private async handleDisconnect(ws: WebSocket): Promise<void> {
    await this.ensureState();
    const state = this.state;
    if (!state) return;

    const playerId = this.getAttachment(ws)?.playerId ?? null;
    if (!playerId || !state.players[playerId]) return;

    state.players[playerId].connected = false;
    refreshHost(state);

    const event = state.status === "voting" ? this.resolveVoteIfNeeded() : null;
    await this.persist();
    if (event) this.broadcast(event);
    this.broadcastRoomState();
  }

  private startRound(): void {
    const state = this.requireState();
    const now = Date.now();

    for (const player of Object.values(state.players)) {
      player.startChar = null;
      player.endChar = null;
    }

    const startChar = pickRandomHiragana();
    const endChar = pickRandomHiragana();
    for (const player of Object.values(state.players)) {
      if (player.connected) {
        player.startChar = startChar;
        player.endChar = endChar;
      }
    }

    state.status = "playing";
    state.vote = null;
    state.nextRoundStartsAt = null;
    state.round = {
      roundNumber: (state.round?.roundNumber ?? 0) + 1,
      startChar,
      endChar,
      startedAt: now,
      deadlineAt: now + ROUND_TIMEOUT_MS,
      endedAt: null,
      winnerPlayerId: null,
      winningWord: null,
      bestAnswers: {},
    };
  }

  private recordBestAnswer(playerId: string, word: string): void {
    const state = this.requireState();
    const round = state.round;
    if (!round) return;

    const nextAnswer: RoundAnswer = {
      playerId,
      word,
      length: countHiraganaChars(word),
      submittedAt: Date.now(),
    };
    const current = round.bestAnswers[playerId];
    if (!current || nextAnswer.length > current.length) {
      round.bestAnswers[playerId] = nextAnswer;
    }
  }

  private startVoteForBestAnswer(): ServerMessage {
    const state = this.requireState();
    const candidate = this.getBestRoundAnswer();
    if (!candidate) {
      return this.finishRound(null, null);
    }

    return this.startVote(candidate.playerId, candidate.word);
  }

  private getBestRoundAnswer(): RoundAnswer | null {
    const state = this.requireState();
    const answers = Object.values(state.round?.bestAnswers ?? {});
    if (answers.length === 0) return null;
    return answers.sort((a, b) => {
      if (b.length !== a.length) return b.length - a.length;
      return a.submittedAt - b.submittedAt;
    })[0];
  }

  private startVote(answerPlayerId: string, word: string): ServerMessage {
    const state = this.requireState();
    const now = Date.now();
    const activePlayerCount = getConnectedPlayerCount(state);
    const vote: VoteState = {
      answerId: crypto.randomUUID(),
      word,
      answerPlayerId,
      startedAt: now,
      deadlineAt: now + VOTE_TIMEOUT_MS,
      requiredApproveVotes: getRequiredApproveVotes(activePlayerCount),
      votes: {
        [answerPlayerId]: "approve",
      },
    };

    state.status = "voting";
    state.vote = vote;

    const immediateEvent = this.resolveVoteIfNeeded();
    if (immediateEvent) return immediateEvent;

    const totals = countVoteTotals(vote);
    return {
      type: "vote_started",
      answerId: vote.answerId,
      answerPlayerId,
      answerPlayerName: state.players[answerPlayerId]?.name ?? "",
      word,
      requiredApproveVotes: vote.requiredApproveVotes,
      approveVotes: totals.approve,
      rejectVotes: totals.reject,
    };
  }

  private resolveVoteIfNeeded(): ServerMessage | null {
    const state = this.requireState();
    if (!state.vote) return null;

    const decision = getVoteDecision(state.vote, getConnectedPlayerIds(state));
    if (decision === "approved") {
      return this.finishRound(state.vote.answerPlayerId, state.vote.word);
    }
    if (decision === "rejected") {
      return this.rejectCurrentVote();
    }
    return null;
  }

  private rejectCurrentVote(): ServerMessage | null {
    const state = this.requireState();
    const vote = state.vote;
    if (!vote) return null;

    state.vote = null;
    return this.finishRound(null, null);
  }

  private finishRound(winnerPlayerId: string | null, winningWord: string | null): ServerMessage {
    const state = this.requireState();
    const now = Date.now();
    const round = state.round;

    if (round) {
      round.endedAt = now;
      round.winnerPlayerId = winnerPlayerId;
      round.winningWord = winningWord;
    }

    state.vote = null;
    state.nextRoundStartsAt = null;

    if (winnerPlayerId && state.players[winnerPlayerId]) {
      state.players[winnerPlayerId].score += 1;
      if (state.players[winnerPlayerId].score >= state.targetScore) {
        state.status = "finished";
        return {
          type: "game_finished",
          winnerPlayerId,
          winnerPlayerName: state.players[winnerPlayerId].name,
          scores: this.getScores(),
        };
      }
    }

    state.status = "round_result";
    state.nextRoundStartsAt = now + ROUND_RESULT_MS;
    return {
      type: "round_finished",
      winnerPlayerId,
      winnerPlayerName: winnerPlayerId ? state.players[winnerPlayerId]?.name ?? null : null,
      word: winningWord,
      scores: this.getScores(),
    };
  }

  private createRoundStartedMessage(): ServerMessage {
    const state = this.requireState();
    const publicState = toPublicGameState(state);
    return {
      type: "round_started",
      round: publicState.round!,
      players: publicState.players,
    };
  }

  private getScores(): Record<string, number> {
    const state = this.requireState();
    return Object.fromEntries(Object.values(state.players).map((player) => [player.id, player.score]));
  }

  private async ensureState(roomId?: string): Promise<GameState> {
    await this.ready;
    if (!this.state) {
      if (!roomId) {
        throw new Error("Room state has not been initialized.");
      }
      this.state = createInitialGameState(roomId);
      await this.persist();
    }
    return this.state;
  }

  private requireState(): GameState {
    if (!this.state) throw new Error("Room state has not been initialized.");
    return this.state;
  }

  private migrateState(): void {
    const state = this.state;
    if (!state) return;
    const round = state.round as GameState["round"] & { length?: number };
    if (round && (!round.startChar || !round.endChar || !round.bestAnswers)) {
      state.status = "waiting";
      state.round = null;
      state.vote = null;
      state.nextRoundStartsAt = null;
      clearPlayerConditions(state);
    }
  }

  private async persist(): Promise<void> {
    if (!this.state) return;
    await this.ctx.storage.put(GAME_STATE_KEY, this.state);
    await this.scheduleAlarm();
  }

  private async scheduleAlarm(): Promise<void> {
    const state = this.state;
    if (!state) return;

    let alarmAt: number | null = null;
    if (state.status === "voting" && state.vote) {
      alarmAt = state.vote.deadlineAt;
    } else if (state.status === "playing" && state.round) {
      alarmAt = state.round.deadlineAt;
    } else if (state.status === "round_result") {
      alarmAt = state.nextRoundStartsAt;
    }

    if (alarmAt) {
      await this.ctx.storage.setAlarm(alarmAt);
    } else {
      await this.ctx.storage.deleteAlarm();
    }
  }

  private broadcastRoomState(): void {
    for (const ws of this.ctx.getWebSockets()) {
      this.sendRoomState(ws);
    }
  }

  private sendRoomState(ws: WebSocket): void {
    const state = this.state;
    if (!state) return;
    const attachment = this.getAttachment(ws);
    this.send(ws, {
      type: "room_state",
      state: toPublicGameState(state),
      youPlayerId: attachment?.playerId ?? null,
    });
  }

  private broadcast(message: ServerMessage): void {
    for (const ws of this.ctx.getWebSockets()) {
      this.send(ws, message);
    }
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      // Closed sockets can remain visible briefly; state is corrected by close/error handlers.
    }
  }

  private getAttachment(ws: WebSocket): SessionAttachment | null {
    return (ws.deserializeAttachment() as SessionAttachment | null) ?? null;
  }
}

function extractRoomId(pathname: string): string | null {
  return pathname.match(/^\/rooms\/([a-zA-Z0-9_-]{3,64})\/websocket\/?$/)?.[1] ?? null;
}
