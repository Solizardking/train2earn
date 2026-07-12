# My Solana Project PRD

A template for autonomous Solana development with Solana Ralphy.

## Overview

This PRD defines the tasks for building a complete Solana application including on-chain programs, token operations, frontend UI, and comprehensive testing.

## Tasks

### Phase 1: Foundation

- [ ] Initialize Anchor workspace with program scaffold
- [ ] Set up TypeScript client package with @solana/kit
- [ ] Configure LiteSVM testing environment
- [ ] Create development wallet and fund from faucet

### Phase 2: On-Chain Program

- [ ] Define program state accounts (User, Vault, Config)
- [ ] Implement initialize instruction with PDA derivation
- [ ] Implement deposit instruction with token transfer CPI
- [ ] Implement withdraw instruction with authority validation
- [ ] Add program events for indexing
- [ ] Write comprehensive LiteSVM unit tests

### Phase 3: Token Launch (Bags.fm)

- [ ] Create governance token metadata and artwork
- [ ] Launch token via Bags.fm with fee sharing (50% founder, 30% treasury, 20% community)
- [ ] Set up partner config for referral revenue
- [ ] Verify token metadata on-chain
- [ ] Test fee claiming flow

### Phase 4: Frontend

- [ ] Initialize Next.js app with framework-kit
- [ ] Implement wallet connection with @solana/react-hooks
- [ ] Build dashboard showing user positions
- [ ] Create deposit/withdraw forms with transaction signing
- [ ] Add token balance display and refresh
- [ ] Implement transaction history view

### Phase 5: Integration & Testing

- [ ] Write Surfpool integration tests against mainnet state
- [ ] Test full user flow: connect → deposit → withdraw
- [ ] Verify event emissions for indexer compatibility
- [ ] Security review using references/security.md checklist
- [ ] Load test with concurrent users

### Phase 6: Deployment

- [ ] Deploy program to devnet
- [ ] Verify program via Solana Explorer
- [ ] Deploy frontend to Vercel
- [ ] Create deployment documentation
- [ ] Set up monitoring and alerts

## Technical Notes

### Program Architecture

```
programs/my_program/
├── src/
│   ├── lib.rs           # Program entry
│   ├── instructions/    # Instruction handlers
│   ├── state/           # Account structs
│   └── errors.rs        # Custom errors
```

### Token Configuration

```yaml
token:
  name: "MyProject Governance"
  symbol: "MYGOV"
  initialBuySOL: 0.1
  feeClaimers:
    - { provider: twitter, username: founder, bps: 5000 }
    - { provider: github, username: treasury, bps: 3000 }
    - { provider: twitter, username: community, bps: 2000 }
```

### Environment Variables

```bash
SOLANA_RPC_URL=https://api.devnet.solana.com
PRIVATE_KEY=<base58_encoded>
BAGS_API_KEY=<from_dev.bags.fm>
```

## Success Criteria

- [ ] All program instructions work correctly
- [ ] Token launched with proper fee distribution
- [ ] Frontend connects and signs transactions
- [ ] 80%+ test coverage
- [ ] No critical security issues
- [ ] Deployed and accessible on devnet
