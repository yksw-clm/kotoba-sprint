# AGENTS.md

このリポジトリは、Cloudflare Workers + Durable Objects によるリアルタイム対戦型の日本語語彙ゲームを実装するためのプロジェクトです。

AIエージェントは、このファイルに書かれた仕様・設計方針を優先して実装してください。

---

## プロジェクト概要

このアプリは、複数人で遊ぶリアルタイム語彙ゲームです。

各プレイヤーには、ラウンドごとに以下の条件が割り当てられます。

- 最初の文字
- 最後の文字

その後、ラウンドごとにランダムな数字 `a` が提示されます。

プレイヤーは、自分に割り当てられた条件に合う言葉を最速で入力します。

条件は以下です。

- 指定された「最初の文字」で始まる
- 指定された「最後の文字」で終わる
- ひらがな表記で `a` 文字である

例：

```txt
最初の文字: か
最後の文字: り
文字数: 4

有効例:
かおり
```

最初に回答したプレイヤーが即勝利するのではなく、その回答に対して他プレイヤーが投票します。一定数以上の承認票を得た場合、その回答が有効とみなされ、そのプレイヤーが得点します。

---

## 技術スタック

このプロジェクトは、Cloudflare Workers と Durable Objects の単一プロジェクトとして実装します。

### 使用技術

- TypeScript
- Cloudflare Workers
- Cloudflare Durable Objects
- WebSocket
- Wrangler
- 必要に応じて React / Vite などのフロントエンド

### 重要方針

- `apps/api` と `apps/realtime` のように分離しない
- Workers と Durable Objects を同一プロジェクト内で管理する
- 1ルームにつき1つの Durable Object インスタンスを使う
- WebSocket 接続、ゲーム状態、投票状態、プレイヤー管理は Durable Object 側で扱う
- Workers は主に HTTP ルーティングと Durable Object への転送を担当する

---

## 推奨ディレクトリ構成

厳密にこの通りでなくてもよいが、基本的には単一 Workers プロジェクトとして整理すること。

```txt
.
├── AGENTS.md
├── README.md
├── package.json
├── wrangler.toml
├── tsconfig.json
├── src
│   ├── index.ts
│   ├── env.ts
│   ├── durable-objects
│   │   └── RoomObject.ts
│   ├── game
│   │   ├── constants.ts
│   │   ├── types.ts
│   │   ├── rules.ts
│   │   ├── votes.ts
│   │   └── state.ts
│   ├── websocket
│   │   ├── messages.ts
│   │   └── sessions.ts
│   └── utils
│       └── random.ts
└── public
```

フロントエンドを同居させる場合は、以下のような構成でもよい。

```txt
.
├── src
│   ├── worker
│   │   ├── index.ts
│   │   └── durable-objects
│   │       └── RoomObject.ts
│   ├── game
│   ├── websocket
│   └── client
│       ├── App.tsx
│       └── main.tsx
└── public
```

ただし、Workers と Durable Objects は必ず同一プロジェクト内に置くこと。

---

## ゲームルール

### 使用する文字

「最初の文字」と「最後の文字」に使える文字は、五十音のひらがなから `を` と `ん` を除いたものとする。

```ts
export const HIRAGANA_BASE = [
  "あ", "い", "う", "え", "お",
  "か", "き", "く", "け", "こ",
  "さ", "し", "す", "せ", "そ",
  "た", "ち", "つ", "て", "と",
  "な", "に", "ぬ", "ね", "の",
  "は", "ひ", "ふ", "へ", "ほ",
  "ま", "み", "む", "め", "も",
  "や", "ゆ", "よ",
  "ら", "り", "る", "れ", "ろ",
  "わ",
] as const;
```

濁音・半濁音は、最初の文字・最後の文字の候補には含めない。

つまり、以下は条件文字としては使わない。

```txt
がぎぐげご
ざじずぜぞ
だぢづでど
ばびぶべぼ
ぱぴぷぺぽ
```

ただし、回答単語の中に濁音・半濁音が含まれることは許可してよい。

例：

```txt
最初の文字: か
最後の文字: り
文字数: 4

かざり
```

---

## 文字数の数え方

文字数は、発音上の拍・モーラではなく、ひらがな表記上の文字数で数える。

つまり、小さい文字も1文字として数える。

例：

```txt
きゃべつ = 4文字
き ゃ べ つ

しゅくだい = 5文字
し ゅ く だ い

ちょこれーと = 6文字以上
ち ょ こ れ ー と
```

実装では、JavaScript の単純な `word.length` ではなく、`Array.from(word).length` を使うこと。

```ts
export function countHiraganaChars(word: string): number {
  return Array.from(word).length;
}
```

---

## 回答の基本判定

回答が形式上有効かどうかは、以下で判定する。

- 空文字ではない
- ひらがなのみで構成されている
- 指定された最初の文字で始まる
- 指定された最後の文字で終わる
- 指定された文字数と一致する

辞書による実在単語チェックは行わない。

このゲームでは、単語の正当性はプレイヤー投票によって判定する。

```ts
export function isStructurallyValidAnswer(params: {
  word: string;
  startChar: string;
  endChar: string;
  length: number;
}): boolean {
  const chars = Array.from(params.word);

  if (chars.length === 0) return false;

  return (
    isHiraganaWord(params.word) &&
    chars[0] === params.startChar &&
    chars[chars.length - 1] === params.endChar &&
    chars.length === params.length
  );
}
```

ひらがな判定は以下を基本とする。

```ts
export function isHiraganaWord(word: string): boolean {
  return /^[ぁ-ん]+$/.test(word);
}
```

長音 `ー` を許可するかどうかは慎重に扱う。初期実装では、ルールを単純にするため禁止してよい。

---

## 辞書制ではなく投票制

このゲームでは辞書を使わない。

回答が構造的に条件を満たしている場合、その回答は投票フェーズに入る。

### 投票の流れ

1. プレイヤーが回答を送信する
2. Durable Object 側で形式判定する
3. 形式的に無効なら即却下する
4. 形式的に有効なら投票フェーズに入る
5. 他プレイヤーがその回答に対して承認または否認を投票する
6. 承認票が必要数に達したら回答を有効とする
7. 回答者に得点を与える
8. ラウンド終了
9. 次ラウンドへ進む

---

## 投票の承認条件

承認に必要な票数は、基本的に `3票` とする。

ただし、参加人数が少ない場合のため、以下のルールを使う。

```ts
export function getRequiredApproveVotes(playerCount: number): number {
  if (playerCount <= 2) return 1;
  return 3;
}
```

### 例

```txt
2人対戦: 1票で通過
3人対戦: 3票で通過
4人対戦: 3票で通過
5人対戦: 3票で通過
6人対戦: 3票で通過
```

ただし、3人対戦で「回答者以外の2人だけが投票できる」仕様にすると3票に届かない。

そのため、以下のどちらかの仕様を選ぶこと。

### 推奨仕様

回答者本人の票も自動的に承認票として数える。

つまり、回答が形式的に有効だった時点で、回答者の承認票が1票入る。

この場合、

```txt
3人対戦:
回答者本人の自動承認 1票
他2人の承認 2票
合計3票で通過
```

となり、3人対戦でも成立する。

### 投票仕様

- 回答者本人は手動投票できない
- 回答者本人の票は、自動承認票として扱う
- 各プレイヤーは1つの回答に対して1回だけ投票できる
- 承認票が必要数に達した時点で回答は通過
- 回答が通過したらラウンドを終了する
- ラウンド終了後の投票は受け付けない

---

## 否認票の扱い

初期実装では、否認票だけで即却下する必要はない。

ただし、全員の投票が完了しても承認票が必要数に達していない場合、その回答は却下する。

例：

```txt
5人対戦
必要承認票: 3
回答者の自動承認: 1
他4人が投票可能

最終結果:
承認 2
否認 3

承認票が3に届いていないため却下
```

却下された場合、そのラウンドは継続する。

同じプレイヤーが再度回答してよいかどうかは、初期実装では許可してよい。

ただし、同じ単語の連投は禁止してもよい。

---

## 回答と投票の競合処理

投票フェーズ中に、別のプレイヤーが回答を送信した場合の扱いを決める必要がある。

初期実装では、以下のシンプルな仕様を採用する。

- 投票中は新しい回答を受け付けない
- 現在の回答が通過または却下されるまで、ラウンドは投票中状態になる
- 却下された場合のみ、再び回答受付状態に戻る

これにより、実装が単純になる。

---

## ゲーム状態

ゲーム全体の状態は Durable Object 内に保持する。

```ts
export type GameStatus =
  | "waiting"
  | "playing"
  | "voting"
  | "round_result"
  | "finished";

export type Player = {
  id: string;
  name: string;
  score: number;
  connected: boolean;
  startChar: string | null;
  endChar: string | null;
};

export type RoundState = {
  roundNumber: number;
  length: number;
  startedAt: number;
  endedAt: number | null;
  winnerPlayerId: string | null;
  winningWord: string | null;
};

export type VoteValue = "approve" | "reject";

export type VoteState = {
  answerId: string;
  word: string;
  answerPlayerId: string;
  startedAt: number;
  requiredApproveVotes: number;
  votes: Record<string, VoteValue>;
};

export type GameState = {
  status: GameStatus;
  roomId: string;
  players: Record<string, Player>;
  round: RoundState | null;
  vote: VoteState | null;
  targetScore: number;
};
```

---

## ラウンド状態の流れ

```txt
waiting
  ↓
playing
  ↓
voting
  ↓
round_result
  ↓
playing
  ↓
...
finished
```

### waiting

ルーム作成後、ゲーム開始前の状態。

プレイヤーの参加・退出を受け付ける。

### playing

回答受付中の状態。

各プレイヤーは自分の条件に合う言葉を送信できる。

### voting

あるプレイヤーの回答に対して投票中の状態。

この状態では、新しい回答は受け付けない。

### round_result

ラウンド結果を表示する短い状態。

一定時間後に次ラウンドへ進む。

### finished

誰かが目標点に到達した状態。

---

## WebSocket メッセージ設計

WebSocket メッセージは、必ず `type` フィールドを持つ discriminated union として定義する。

### Client to Server

```ts
export type ClientMessage =
  | JoinRoomMessage
  | StartGameMessage
  | SubmitAnswerMessage
  | SubmitVoteMessage;

export type JoinRoomMessage = {
  type: "join_room";
  name: string;
};

export type StartGameMessage = {
  type: "start_game";
};

export type SubmitAnswerMessage = {
  type: "submit_answer";
  word: string;
};

export type SubmitVoteMessage = {
  type: "submit_vote";
  answerId: string;
  vote: "approve" | "reject";
};
```

### Server to Client

```ts
export type ServerMessage =
  | RoomStateMessage
  | GameStartedMessage
  | RoundStartedMessage
  | AnswerRejectedMessage
  | VoteStartedMessage
  | VoteUpdatedMessage
  | RoundFinishedMessage
  | GameFinishedMessage
  | ErrorMessage;

export type RoomStateMessage = {
  type: "room_state";
  state: PublicGameState;
};

export type GameStartedMessage = {
  type: "game_started";
  state: PublicGameState;
};

export type RoundStartedMessage = {
  type: "round_started";
  round: PublicRoundState;
  players: PublicPlayerState[];
};

export type AnswerRejectedMessage = {
  type: "answer_rejected";
  reason:
    | "not_playing"
    | "already_voting"
    | "invalid_format"
    | "not_joined";
};

export type VoteStartedMessage = {
  type: "vote_started";
  answerId: string;
  answerPlayerId: string;
  answerPlayerName: string;
  word: string;
  requiredApproveVotes: number;
  approveVotes: number;
  rejectVotes: number;
};

export type VoteUpdatedMessage = {
  type: "vote_updated";
  answerId: string;
  approveVotes: number;
  rejectVotes: number;
  requiredApproveVotes: number;
};

export type RoundFinishedMessage = {
  type: "round_finished";
  winnerPlayerId: string;
  winnerPlayerName: string;
  word: string;
  scores: Record<string, number>;
};

export type GameFinishedMessage = {
  type: "game_finished";
  winnerPlayerId: string;
  winnerPlayerName: string;
  scores: Record<string, number>;
};

export type ErrorMessage = {
  type: "error";
  message: string;
};
```

---

## PublicGameState

クライアントへ送る状態は、内部状態をそのまま送らないこと。

Durable Object 内部で使う `GameState` と、クライアントへ送る `PublicGameState` は分ける。

```ts
export type PublicPlayerState = {
  id: string;
  name: string;
  score: number;
  connected: boolean;
  startChar: string | null;
  endChar: string | null;
};

export type PublicRoundState = {
  roundNumber: number;
  length: number;
  startedAt: number;
};

export type PublicVoteState = {
  answerId: string;
  word: string;
  answerPlayerId: string;
  requiredApproveVotes: number;
  approveVotes: number;
  rejectVotes: number;
  votedPlayerIds: string[];
};

export type PublicGameState = {
  status: GameStatus;
  roomId: string;
  players: PublicPlayerState[];
  round: PublicRoundState | null;
  vote: PublicVoteState | null;
  targetScore: number;
};
```

---

## 入力正規化

回答はサーバー側で正規化する。

最低限、以下を行う。

- 前後の空白を削除
- 全角・半角などを Unicode 正規化
- カタカナをひらがなに変換
- 内部の空白を削除

```ts
export function normalizeAnswer(input: string): string {
  return katakanaToHiragana(
    input
      .trim()
      .replace(/\s+/g, "")
      .normalize("NFKC")
  );
}

export function katakanaToHiragana(str: string): string {
  return str.replace(/[\u30a1-\u30f6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );
}
```

---

## 文字数生成

初期実装では、文字数 `a` は 3〜6 の範囲でランダムにする。

```ts
export const MIN_WORD_LENGTH = 3;
export const MAX_WORD_LENGTH = 6;

export function randomWordLength(): number {
  return randomInt(MIN_WORD_LENGTH, MAX_WORD_LENGTH);
}
```

`randomInt(min, max)` は両端を含む整数を返すこと。

```ts
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
```

---

## 条件文字の割り当て

ラウンド開始時に、各プレイヤーへ `startChar` と `endChar` をランダムに割り当てる。

```ts
export function pickRandomHiragana(): string {
  return HIRAGANA_BASE[randomInt(0, HIRAGANA_BASE.length - 1)];
}
```

同じプレイヤーに対して、

```txt
最初の文字 = 最後の文字
```

となることは許可してよい。

例：

```txt
あではじまり、あで終わる4文字
```

これは有効な条件とする。

---

## 得点と勝利条件

初期実装では以下とする。

- 有効回答が投票を通過したら回答者に1点
- 目標点は5点
- 5点に到達したプレイヤーが出たらゲーム終了

```ts
export const DEFAULT_TARGET_SCORE = 5;
```

---

## Durable Object の責務

Durable Object はルーム単位のゲーム状態を管理する。

### 主な責務

- WebSocket 接続の受け入れ
- プレイヤー参加管理
- 切断管理
- ゲーム開始
- ラウンド開始
- 条件文字と文字数の生成
- 回答受付
- 回答の形式判定
- 投票フェーズ管理
- 投票受付
- 承認票数の判定
- ラウンド終了
- スコア更新
- ゲーム終了判定
- クライアントへの状態ブロードキャスト

### 重要

最速回答や投票の成立判定は、必ず Durable Object 側で行うこと。

クライアント側の時刻や判定結果を信用してはいけない。

---

## Workers の責務

Workers 側は、主に HTTP エントリーポイントとして機能する。

### 例

- `GET /`  
  フロントエンドまたは簡易ページを返す

- `GET /rooms/:roomId/websocket`  
  指定ルームの Durable Object へ WebSocket 接続を転送する

- `POST /rooms`  
  必要であればルームIDを生成する

Workers 側でゲーム状態を持たないこと。

ゲーム状態は Durable Object 側に集約する。

---

## ルームID

ルームIDは URL に含める。

例：

```txt
https://example.com/rooms/abc123
```

WebSocket 接続先は以下のようにする。

```txt
wss://example.com/rooms/abc123/websocket
```

Durable Object の ID は、ルームIDから `idFromName(roomId)` で取得する。

```ts
const id = env.ROOM_OBJECT.idFromName(roomId);
const stub = env.ROOM_OBJECT.get(id);
return stub.fetch(request);
```

---

## WebSocket セッション管理

Durable Object 内では、WebSocket とプレイヤーIDを紐づける。

```ts
type Session = {
  socket: WebSocket;
  playerId: string | null;
};
```

1つの WebSocket 接続につき1つのセッションを持つ。

プレイヤーが `join_room` を送信するまでは、`playerId` は `null` でよい。

---

## 切断時の扱い

初期実装では、切断されたプレイヤーは即削除せず、`connected: false` にする。

再接続機能は後で実装してよい。

最初は以下でよい。

- 切断時に `connected: false`
- ゲーム中でもスコアや名前は保持
- 投票中に切断した場合、そのプレイヤーの票は入らない
- 全員切断した場合でも、Durable Object のメモリ状態が残る保証はしない

永続化は初期実装では不要。

---

## 投票中の切断

投票中にプレイヤーが切断した場合、初期実装では以下の扱いにする。

- すでに投票済みなら、その票は残す
- 未投票のまま切断した場合、そのプレイヤーの票は入らない
- 全員の投票完了判定では、接続中のプレイヤーのみを対象にしてよい

ただし、承認に必要な票数はラウンド開始時または投票開始時のプレイヤー数を基準にすること。

```ts
const requiredApproveVotes = getRequiredApproveVotes(activePlayerCount);
```

---

## 投票タイムアウト

投票が永遠に終わらないことを防ぐため、投票にはタイムアウトを設ける。

初期実装では 15 秒とする。

```ts
export const VOTE_TIMEOUT_MS = 15_000;
```

タイムアウト時に承認票が必要数に達していない場合、その回答は却下する。

却下されたら `playing` 状態に戻り、回答受付を再開する。

---

## ラウンドタイムアウト

回答が出ないままラウンドが停滞しないように、ラウンドにもタイムアウトを設ける。

初期実装では 60 秒とする。

```ts
export const ROUND_TIMEOUT_MS = 60_000;
```

タイムアウトした場合は、そのラウンドを無得点で終了し、次ラウンドへ進む。

---

## ルール実装で注意すること

### 1. クライアントの入力を信用しない

以下は必ずサーバー側で判定する。

- プレイヤーが参加済みか
- ゲームが回答受付中か
- 文字数が合っているか
- 最初の文字が合っているか
- 最後の文字が合っているか
- 投票権があるか
- すでに投票済みか
- 承認票が必要数に達したか

### 2. 二重送信を考慮する

同じプレイヤーが回答や投票を連続送信する可能性がある。

- 投票は1人1回
- ラウンド終了後の回答は無視
- 投票終了後の投票は無視
- すでに勝者が決まったラウンドには得点を二重加算しない

### 3. Durable Object 内で順序を確定する

最初に届いた有効回答だけを投票対象にする。

投票中は新しい回答を受け付けない。

### 4. 状態変更後は broadcast する

ゲーム状態が変わったら、接続中の全クライアントへ状態を送る。

---

## 実装すべき主要関数

### ルール系

```ts
countHiraganaChars(word: string): number

isHiraganaWord(word: string): boolean

normalizeAnswer(input: string): string

isStructurallyValidAnswer(params: {
  word: string;
  startChar: string;
  endChar: string;
  length: number;
}): boolean

getRequiredApproveVotes(playerCount: number): number

randomWordLength(): number

pickRandomHiragana(): string
```

### ゲーム進行系

```ts
startGame(): void

startRound(): void

submitAnswer(playerId: string, word: string): void

startVote(params: {
  answerPlayerId: string;
  word: string;
}): void

submitVote(playerId: string, answerId: string, vote: VoteValue): void

approveAnswer(): void

rejectAnswer(): void

finishRound(params: {
  winnerPlayerId: string | null;
  winningWord: string | null;
}): void

finishGame(winnerPlayerId: string): void
```

---

## Wrangler 設定方針

`wrangler.toml` では Durable Object binding を設定する。

例：

```toml
name = "word-sprint"
main = "src/index.ts"
compatibility_date = "2026-06-01"

[[durable_objects.bindings]]
name = "ROOM_OBJECT"
class_name = "RoomObject"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["RoomObject"]
```

実際の compatibility_date は作成時点の最新安定日付に合わせてよい。

---

## 実装の優先順位

AIエージェントは、以下の順で保守的に実装すること。

### Phase 1: 最小ゲームループ

- Workers エントリーポイント
- Durable Object
- WebSocket 接続
- ルーム参加
- ゲーム開始
- ラウンド開始
- 条件表示
- 回答送信
- 形式判定
- 投票開始
- 投票受付
- 承認票による得点
- 次ラウンド
- 5点先取で終了

### Phase 2: 体験改善

- 投票タイムアウト
- ラウンドタイムアウト
- 切断表示
- 再接続の簡易対応
- エラーメッセージ改善
- UI改善

### Phase 3: ゲーム性改善

- 文字数範囲の調整
- 難しすぎる条件の回避
- 同じ条件の連続出題防止
- 同じ回答の連投禁止
- ルーム設定
- 観戦機能
- プライベートルーム

---

## テスト方針

可能であれば、ゲームロジックは Durable Object に直書きしすぎず、純粋関数として切り出してテストしやすくする。

最低限テストしたいもの。

- ひらがな文字数のカウント
- カタカナからひらがなへの正規化
- 最初の文字判定
- 最後の文字判定
- 文字数判定
- 投票必要数の計算
- 承認票が必要数に達したときの通過
- タイムアウト時の却下
- 投票中に別回答を受け付けないこと

---

## このプロジェクトでやらないこと

初期実装では以下はやらない。

- 辞書による単語判定
- AIによる単語判定
- 永続的な戦績保存
- アカウント認証
- 課金
- ランキング
- 複雑なレーティング
- 複数 Workers プロジェクトへの分割
- バックエンド API とリアルタイムサーバーの分離

---

## コーディング方針

- TypeScript の型を明確にする
- `any` はなるべく使わない
- WebSocket メッセージは必ず `type` で分岐する
- クライアントから来た JSON は必ずバリデーションする
- Durable Object 内の状態変更は、できるだけメソッド単位で整理する
- ゲームルールは `src/game` に切り出す
- WebSocket メッセージ型は `src/websocket/messages.ts` に集約する
- マジックナンバーは `constants.ts` に集約する

---

## 命名案

正式名称は未定。

仮称として以下を使ってよい。

```txt
ことばスプリント
Word Sprint
```

コード上では、`word-sprint` や `WordSprint` を使ってよい。

---

## 最重要仕様まとめ

- Workers + Durable Objects の単一プロジェクト
- 1ルーム = 1 Durable Object
- WebSocket によるリアルタイム対戦
- 各プレイヤーに「最初の文字」と「最後の文字」を割り当てる
- ラウンドごとにランダムな文字数 `a` を出す
- 文字数は、ひらがな表記上の文字数で数える
- 小さい文字も1文字として数える
- 辞書制ではなく投票制
- 5人なら3票で通過
- 6人でも3票で通過
- 回答者本人の票は自動承認票として扱う
- 投票中は新しい回答を受け付けない
- 承認票が必要数に達したら回答者に1点
- 5点先取で勝利