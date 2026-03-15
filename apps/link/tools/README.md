# MITM Tools

`mitm-inspector.js` reads `tmp/mitm_gate_packets_full.jsonl`, decodes `gatepb.Message` / `gatepb.EventMessage`, and tries to decode request, reply, and notify bodies with the proto files under `apps/link/src/assets/proto`.

Examples:

```bash
pnpm --filter link analyze:mitm
pnpm --filter link analyze:mitm sample --service gamepb.paypb.PayService --method GetRechargeInfo --message-type 2 --limit 1
pnpm --filter link analyze:mitm sample --event gamepb.paypb.RechargeInfoNotify --limit 1
```

When no matching schema exists, the tool falls back to a raw protobuf field tree so live mitm data can still be documented before the proto is finalized.
