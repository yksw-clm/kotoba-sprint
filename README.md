# ことばスプリント

Cloudflare Workers + Durable Objects で動く、リアルタイム対戦型の日本語語彙ゲームです。

## Commands

```sh
npm install
npm run dev
npm test
npm run typecheck
npm run build
```

`/` にアクセスすると新しいルームが作られ、`/rooms/:roomId` のURLを共有して参加できます。
