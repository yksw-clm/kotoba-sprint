import {
  Check,
  Copy,
  Crown,
  Play,
  RotateCcw,
  Send,
  Share2,
  Users,
  WifiOff,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ALLOWED_ROUND_TIME_SECONDS,
  MAX_TARGET_SCORE,
  MIN_TARGET_SCORE,
} from "../game/constants";
import type {
  GameSettings,
  PublicGameState,
  PublicPlayerState,
  RoundTimeSeconds,
} from "../game/types";
import type { ServerMessage } from "../websocket/messages";

type ConnectionPhase = "name" | "creating_room" | "connecting" | "joined";

export function App() {
  const initialRoomId = getRoomIdFromLocation();
  const [roomId, setRoomId] = useState<string | null>(initialRoomId);
  const [phase, setPhase] = useState<ConnectionPhase>(initialRoomId ? "name" : "creating_room");
  const [name, setName] = useState("");
  const [state, setState] = useState<PublicGameState | null>(null);
  const [youPlayerId, setYouPlayerId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (roomId) return;

    let cancelled = false;
    fetch("/rooms", { method: "POST" })
      .then((response) => response.json() as Promise<{ roomId: string; path: string }>)
      .then((room) => {
        if (cancelled) return;
        window.history.replaceState(null, "", room.path);
        setRoomId(room.roomId);
        setPhase("name");
      })
      .catch(() => {
        if (!cancelled) setNotice("ルームを作れませんでした。");
      });

    return () => {
      cancelled = true;
    };
  }, [roomId]);

  useEffect(() => {
    return () => socketRef.current?.close();
  }, []);

  const send = (message: object) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setNotice("接続がまだ開いていません。");
      return;
    }
    socket.send(JSON.stringify(message));
  };

  const joinRoom = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanName = name.trim();
    if (!roomId || !cleanName) return;

    socketRef.current?.close();
    setPhase("connecting");
    setNotice(null);

    const socket = new WebSocket(createWebSocketUrl(roomId));
    socketRef.current = socket;

    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({ type: "join_room", name: cleanName }));
    });

    socket.addEventListener("message", (messageEvent) => {
      const message = parseServerMessage(messageEvent.data);
      if (!message) return;

      if (message.type === "room_state") {
        setState(message.state);
        if (message.youPlayerId) {
          setYouPlayerId(message.youPlayerId);
          setPhase("joined");
        }
      }

      if (message.type === "you_joined") {
        setYouPlayerId(message.playerId);
        setPhase("joined");
      }

      if (message.type === "error") {
        setNotice(message.message);
      }

      if (message.type === "game_started" || message.type === "round_started") {
        setNotice(null);
      }

      if (message.type === "answer_rejected") {
        setNotice(answerRejectedText[message.reason]);
      }

      if (message.type === "vote_rejected") {
        setNotice(`「${message.word}」は否認されました。`);
      }

      if (message.type === "round_finished" && message.winnerPlayerName) {
        setNotice(`${message.winnerPlayerName} さんが+${message.awardedPoints}点獲得しました。`);
      }

      if (message.type === "round_finished" && !message.winnerPlayerName) {
        setNotice("このラウンドは無得点です。");
      }
    });

    socket.addEventListener("close", () => {
      setNotice("接続が切れました。");
    });

    socket.addEventListener("error", () => {
      setNotice("接続エラーが発生しました。");
    });
  };

  const me = useMemo(
    () => state?.players.find((player) => player.id === youPlayerId) ?? null,
    [state, youPlayerId],
  );
  const isHost = Boolean(state && youPlayerId && state.hostPlayerId === youPlayerId);

  if (phase === "creating_room") {
    return (
      <Shell>
        <div className="centerStatus">ルーム作成中...</div>
      </Shell>
    );
  }

  if (phase === "name") {
    return (
      <Shell notice={notice}>
        <NameScreen name={name} setName={setName} onSubmit={joinRoom} />
      </Shell>
    );
  }

  if (phase === "connecting" || !state) {
    return (
      <Shell notice={notice}>
        <div className="centerStatus">接続中...</div>
      </Shell>
    );
  }

  if (state.status === "waiting") {
    return (
      <Shell notice={notice}>
        <WaitingScreen
          state={state}
          isHost={isHost}
          onStart={(settings) => send({ type: "start_game", settings })}
        />
      </Shell>
    );
  }

  if (state.status === "finished") {
    return (
      <Shell notice={notice}>
        <FinishedScreen
          state={state}
          isHost={isHost}
          onRestart={() => send({ type: "restart_game" })}
        />
      </Shell>
    );
  }

  return (
    <Shell notice={notice}>
      <GameScreen state={state} me={me} youPlayerId={youPlayerId} onSend={send} />
    </Shell>
  );
}

function Shell({ children, notice }: { children: React.ReactNode; notice?: string | null }) {
  return (
    <main className="appShell">
      <section className="phoneFrame">
        {notice ? <div className="notice">{notice}</div> : null}
        {children}
      </section>
    </main>
  );
}

function NameScreen({
  name,
  setName,
  onSubmit,
}: {
  name: string;
  setName: (name: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="nameScreen">
      <div className="brandBlock">
        <span className="brandKana">ことばスプリント</span>
        <h1>名前を決める</h1>
      </div>
      <form className="nameForm" onSubmit={onSubmit}>
        <label htmlFor="name">プレイヤー名</label>
        <input
          id="name"
          value={name}
          maxLength={16}
          autoFocus
          inputMode="text"
          placeholder="例: あおい"
          onChange={(event) => setName(event.target.value)}
        />
        <button className="primaryButton" type="submit" disabled={!name.trim()}>
          <Users size={19} aria-hidden="true" />
          入室する
        </button>
      </form>
    </div>
  );
}

function WaitingScreen({
  state,
  isHost,
  onStart,
}: {
  state: PublicGameState;
  isHost: boolean;
  onStart: (settings: GameSettings) => void;
}) {
  const [targetScore, setTargetScore] = useState(state.targetScore);
  const [roundTimeSeconds, setRoundTimeSeconds] = useState<RoundTimeSeconds>(
    state.roundTimeSeconds,
  );
  const connectedCount = state.players.filter((player) => player.connected).length;
  const targetScoreIsValid =
    Number.isInteger(targetScore) &&
    targetScore >= MIN_TARGET_SCORE &&
    targetScore <= MAX_TARGET_SCORE;
  const canStart = isHost && connectedCount >= 2 && targetScoreIsValid;
  const shareUrl = window.location.href;

  useEffect(() => {
    setTargetScore(state.targetScore);
    setRoundTimeSeconds(state.roundTimeSeconds);
  }, [state.targetScore, state.roundTimeSeconds]);

  return (
    <div className="stack">
      <header className="screenHeader">
        <div>
          <span className="eyebrow">待機中</span>
          <h1>参加者</h1>
        </div>
        <div className="countBadge">
          <Users size={16} aria-hidden="true" />
          {connectedCount}
        </div>
      </header>

      <PlayerList players={state.players} hostPlayerId={state.hostPlayerId} />

      <section className="settingsPanel" aria-label="ゲーム設定">
        <div className="settingsHeader">
          <span className="eyebrow">設定</span>
          <strong>
            目標 {isHost ? targetScore : state.targetScore}点 / 1R{" "}
            {isHost ? roundTimeSeconds : state.roundTimeSeconds}秒
          </strong>
        </div>
        <label className="settingField" htmlFor="targetScore">
          勝利得点
          <input
            id="targetScore"
            type="number"
            min={MIN_TARGET_SCORE}
            max={MAX_TARGET_SCORE}
            step={1}
            value={isHost ? targetScore : state.targetScore}
            disabled={!isHost}
            onChange={(event) => {
              const nextScore = Number.parseInt(event.currentTarget.value, 10);
              setTargetScore(Number.isNaN(nextScore) ? MIN_TARGET_SCORE : nextScore);
            }}
          />
        </label>
        <div className="settingField">
          <span>制限時間</span>
          <div className="segmentedControl" role="group" aria-label="1ラウンドごとの制限時間">
            {ALLOWED_ROUND_TIME_SECONDS.map((seconds) => {
              const selected = (isHost ? roundTimeSeconds : state.roundTimeSeconds) === seconds;
              return (
                <button
                  className={selected ? "segmentButton selected" : "segmentButton"}
                  key={seconds}
                  type="button"
                  disabled={!isHost}
                  onClick={() => setRoundTimeSeconds(seconds)}
                >
                  {seconds}秒
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <div className="actionBand">
        <button
          className="secondaryButton"
          type="button"
          onClick={() => navigator.clipboard?.writeText(shareUrl)}
        >
          <Copy size={18} aria-hidden="true" />
          URLコピー
        </button>
        <button
          className="primaryButton"
          type="button"
          disabled={!canStart}
          onClick={() => onStart({ targetScore, roundTimeSeconds })}
        >
          <Play size={18} aria-hidden="true" />
          開始
        </button>
      </div>

      <div className="hostLine">
        {isHost ? "あなたがホストです" : "ホストの開始を待っています"}
      </div>
    </div>
  );
}

function GameScreen({
  state,
  me,
  youPlayerId,
  onSend,
}: {
  state: PublicGameState;
  me: PublicPlayerState | null;
  youPlayerId: string | null;
  onSend: (message: object) => void;
}) {
  const [word, setWord] = useState("");
  const now = useNow();
  const deadlineAt =
    state.status === "round_result"
      ? state.nextRoundStartsAt
      : (state.vote?.deadlineAt ?? state.round?.deadlineAt);
  const secondsLeft = Math.max(0, Math.ceil(((deadlineAt ?? now) - now) / 1000));
  const canAnswer = state.status === "playing" && Boolean(me?.startChar && me?.endChar);
  const vote = state.vote;
  const hasVoted = Boolean(vote && youPlayerId && vote.votedPlayerIds.includes(youPlayerId));
  const canVote = Boolean(
    state.status === "voting" &&
      vote &&
      youPlayerId &&
      vote.answerPlayerId !== youPlayerId &&
      !hasVoted,
  );
  const answerPlayer = vote
    ? state.players.find((player) => player.id === vote.answerPlayerId)
    : null;
  const isCurrentAnswerMine = Boolean(vote && youPlayerId === vote.answerPlayerId);

  const submitAnswer = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!word.trim()) return;
    onSend({ type: "submit_answer", word });
    setWord("");
  };

  return (
    <div className="stack">
      <header className="screenHeader">
        <div>
          <span className="eyebrow">ROUND {state.round?.roundNumber ?? 0}</span>
          <h1>{statusTitle[state.status] ?? "ゲーム中"}</h1>
          <p className="settingsSummary">
            目標 {state.targetScore}点 / 1R {state.roundTimeSeconds}秒
          </p>
        </div>
        <div className="timerPill">{secondsLeft}s</div>
      </header>

      <section className="conditionPanel twoColumns">
        <div className="conditionCell">
          <span>最初</span>
          <strong>{state.round?.startChar ?? me?.startChar ?? "-"}</strong>
        </div>
        <div className="conditionCell">
          <span>最後</span>
          <strong>{state.round?.endChar ?? me?.endChar ?? "-"}</strong>
        </div>
      </section>

      {state.status === "playing" ? (
        <section className="bestPanel">
          <span className="eyebrow">現在のベスト</span>
          <strong>{getBestAnswerForPlayer(state, youPlayerId)?.word ?? "まだ回答なし"}</strong>
          <small>
            {getBestAnswerForPlayer(state, youPlayerId)
              ? `${getBestAnswerForPlayer(state, youPlayerId)?.length}文字`
              : "60秒以内に何度でも更新できます"}
          </small>
        </section>
      ) : null}

      {state.status === "playing" ? (
        <form className="answerForm" onSubmit={submitAnswer}>
          <input
            value={word}
            disabled={!canAnswer}
            inputMode="text"
            placeholder="ひらがなで入力"
            onChange={(event) => setWord(event.target.value)}
          />
          <button className="iconButton" type="submit" disabled={!canAnswer || !word.trim()} title="送信">
            <Send size={21} aria-hidden="true" />
          </button>
        </form>
      ) : null}

      {state.status === "voting" && vote ? (
        <section className="votePanel">
          <div>
            <span className="eyebrow">
              候補 {vote.candidateIndex}/{vote.totalCandidates}
            </span>
            <h2>{vote.word}</h2>
            <p>
              {answerPlayer?.name ?? "回答者"} さんの回答 / {vote.answerLength}文字
            </p>
          </div>
          <div className="voteCounts">
            <span>実在 {vote.approveVotes}/{vote.requiredApproveVotes}</span>
            <span>しない {vote.rejectVotes}/{vote.requiredApproveVotes}</span>
          </div>
          {isCurrentAnswerMine ? <p className="voteHint">自分の回答は判定待ちです</p> : null}
          <div className="voteActions">
            <button
              className="approveButton"
              type="button"
              disabled={!canVote}
              onClick={() => onSend({ type: "submit_vote", answerId: vote.answerId, vote: "approve" })}
            >
              <Check size={18} aria-hidden="true" />
              実在する
            </button>
            <button
              className="rejectButton"
              type="button"
              disabled={!canVote}
              onClick={() => onSend({ type: "submit_vote", answerId: vote.answerId, vote: "reject" })}
            >
              <X size={18} aria-hidden="true" />
              実在しない
            </button>
          </div>
        </section>
      ) : null}

      {state.status === "round_result" ? (
        <section className="resultPanel">
          <Share2 size={19} aria-hidden="true" />
          {state.round?.winnerPlayerId
            ? `${state.players.find((player) => player.id === state.round?.winnerPlayerId)?.name ?? ""} さんが${state.round.winningAnswerLength ?? 0}文字で+${state.round.winningAnswerLength ?? 0}点`
            : "有効回答なし"}
        </section>
      ) : null}

      <PlayerList
        players={state.players}
        hostPlayerId={state.hostPlayerId}
        bestAnswers={state.round?.bestAnswers ?? []}
      />
    </div>
  );
}

function FinishedScreen({
  state,
  isHost,
  onRestart,
}: {
  state: PublicGameState;
  isHost: boolean;
  onRestart: () => void;
}) {
  const winner = state.players.reduce<PublicPlayerState | null>((current, player) => {
    if (!current || player.score > current.score) return player;
    return current;
  }, null);

  return (
    <div className="stack finishedScreen">
      <header className="screenHeader">
        <div>
          <span className="eyebrow">FINISH</span>
          <h1>{winner?.name ?? "勝者"} さんの勝ち</h1>
        </div>
        <Crown size={30} aria-hidden="true" />
      </header>
      <PlayerList players={state.players} hostPlayerId={state.hostPlayerId} />
      <div className="actionBand">
        <button className="primaryButton" type="button" disabled={!isHost} onClick={onRestart}>
          <RotateCcw size={18} aria-hidden="true" />
          再戦する
        </button>
      </div>
      <div className="hostLine">
        {isHost ? "同じルームで待機画面に戻ります" : "ホストの再戦操作を待っています"}
      </div>
    </div>
  );
}

function PlayerList({
  players,
  hostPlayerId,
  bestAnswers = [],
}: {
  players: PublicPlayerState[];
  hostPlayerId: string | null;
  bestAnswers?: NonNullable<PublicGameState["round"]>["bestAnswers"];
}) {
  const bestAnswerByPlayerId = new Map(bestAnswers.map((answer) => [answer.playerId, answer]));
  return (
    <section className="playerList" aria-label="プレイヤー">
      {players.map((player) => (
        <div className="playerRow" key={player.id}>
          <div className="playerMeta">
            <span className={player.connected ? "statusDot" : "statusDot offline"} />
            <strong>{player.name}</strong>
            {hostPlayerId === player.id ? <Crown size={15} aria-label="ホスト" /> : null}
            {!player.connected ? <WifiOff size={15} aria-label="切断中" /> : null}
          </div>
          <div className="playerStats">
            {bestAnswerByPlayerId.has(player.id) ? (
              <span>{bestAnswerByPlayerId.get(player.id)?.length}文字</span>
            ) : player.startChar && player.endChar ? (
              <span>
                {player.startChar}...{player.endChar}
              </span>
            ) : null}
            <b>{player.score}</b>
          </div>
        </div>
      ))}
    </section>
  );
}

function getBestAnswerForPlayer(state: PublicGameState, playerId: string | null) {
  if (!playerId || !state.round) return null;
  return state.round.bestAnswers.find((answer) => answer.playerId === playerId) ?? null;
}

function useNow(): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

function parseServerMessage(data: unknown): ServerMessage | null {
  if (typeof data !== "string") return null;
  try {
    return JSON.parse(data) as ServerMessage;
  } catch {
    return null;
  }
}

function getRoomIdFromLocation(): string | null {
  return window.location.pathname.match(/^\/rooms\/([a-zA-Z0-9_-]{3,64})\/?$/)?.[1] ?? null;
}

function createWebSocketUrl(roomId: string): string {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}/rooms/${roomId}/websocket`;
}

const statusTitle: Partial<Record<PublicGameState["status"], string>> = {
  playing: "回答受付",
  voting: "投票中",
  round_result: "ラウンド結果",
};

const answerRejectedText = {
  not_playing: "いまは回答できません。",
  already_voting: "投票中は新しい回答を受け付けません。",
  invalid_format: "条件に合っていません。",
  not_joined: "参加後に回答してください。",
  no_condition: "このラウンドの条件がありません。",
} as const;
