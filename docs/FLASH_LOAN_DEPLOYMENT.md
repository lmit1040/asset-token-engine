# Flash Loan Receiver Contract Deployment & Verification Guide

This guide covers deploying and verifying the `MetallumFlashReceiver` smart contract for atomic flash loan arbitrage execution.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Contract Deployment (Remix)](#contract-deployment-remix)
3. [Contract Verification](#contract-verification)
4. [Post-Deployment Configuration](#post-deployment-configuration)
5. [Network-Specific Details](#network-specific-details)
6. [Security Checklist](#security-checklist)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Development Tools
- **Remix IDE**: https://remix.ethereum.org
- **MetaMask**: Browser wallet with testnet/mainnet funds
- **Block Explorer Account**: Polygonscan, Etherscan, etc. (for API key)

### Testnet Tokens (Faucets)
| Network | Faucet URL |
|---------|------------|
| Ethereum Sepolia | https://sepoliafaucet.com |
| Polygon Amoy | https://faucet.polygon.technology |
| Arbitrum Sepolia | https://faucet.arbitrum.io |
| BSC Testnet | https://testnet.bnbchain.org/faucet-smart |

### Aave V3 Pool Addresses Provider (Constructor Argument)
| Network | Pool Addresses Provider |
|---------|------------------------|
| Ethereum Mainnet | `0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e` |
| Ethereum Sepolia | `0x012bAC54348C0E635dCAc9D5FB99f06F24136C9A` |
| Polygon Mainnet | `0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb` |
| Polygon Amoy | `0x36616cf17557639614c1cdDb356b1B83fc0B2132` |
| Arbitrum Mainnet | `0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb` |
| Arbitrum Sepolia | `0x36616cf17557639614c1cdDb356b1B83fc0B2132` |
| BSC Mainnet | `0xff75B6da14FfbbfD355Daf7a2731456b3562Ba6D` |

---

## Contract Deployment (Remix)

### Step 1: Open Remix IDE
Navigate to https://remix.ethereum.org

### Step 2: Create Contract File
1. In File Explorer, create new file: `MetallumFlashReceiver.sol`
2. Copy the contract source from `contracts/MetallumFlashReceiver.sol`

### Step 3: Install Dependencies
In Remix terminal, the dependencies are auto-resolved via imports:
```solidity
import {FlashLoanSimpleReceiverBase} from "@aave/core-v3/contracts/flashloan/base/FlashLoanSimpleReceiverBase.sol";
import {IPoolAddressesProvider} from "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";
import {IERC20} from "@aave/core-v3/contracts/dependencies/openzeppelin/contracts/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
```

### Step 4: Configure Compiler
1. Go to **Solidity Compiler** tab (left sidebar)
2. Set compiler version: `0.8.20+commit.a1b79de6`
3. Enable optimization: ✅ checked
4. Optimization runs: `200`
5. EVM Version: `paris` (or leave default)
6. Click **Compile MetallumFlashReceiver.sol**

### Step 5: Deploy Contract
1. Go to **Deploy & Run Transactions** tab
2. Environment: **Injected Provider - MetaMask**
3. Connect MetaMask to target network
4. Select contract: `MetallumFlashReceiver`
5. Enter constructor argument (Pool Addresses Provider for your network)
6. Click **Deploy**
7. Confirm transaction in MetaMask
8. **Save the deployed contract address!**

---

## Contract Verification

### Method 1: Standard JSON Input (Recommended)

This method is most reliable for contracts with dependencies.

#### Step 1: Generate Standard JSON Input
In Remix:
1. Compile the contract
2. Go to **Solidity Compiler** tab
3. Click **Compilation Details**
4. Find **INPUT** section
5. Copy the entire JSON content

#### Step 2: Verify on Block Explorer
1. Go to your contract on the block explorer
2. Click **Contract** tab → **Verify and Publish**
3. Select verification method: **Standard Input JSON**
4. Compiler Type: **Solidity (Standard-Json-Input)**
5. Compiler Version: `v0.8.20+commit.a1b79de6`
6. License: `MIT`
7. Paste the Standard JSON Input
8. Click **Verify and Publish**

### Method 2: Flattened Source Code

Use this if Standard JSON Input fails.

#### Step 1: Flatten Contract
Using Remix Flattener plugin:
1. Go to **Plugin Manager** (plug icon)
2. Search and activate **Flattener**
3. Select your contract file
4. Click **Flatten**
5. Copy flattened source

#### Step 2: Get Constructor Arguments (ABI-encoded)
Constructor takes one `address` parameter. ABI-encode it:
```
For Polygon Mainnet (0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb):
000000000000000000000000a97684ead0e402dC232d5A977953DF7ECBaB3CDb

For Sepolia (0x012bAC54348C0E635dCAc9D5FB99f06F24136C9A):
000000000000000000000000012bAC54348C0E635dCAc9D5FB99f06F24136C9A
```

#### Step 3: Verify on Block Explorer
1. Go to contract on block explorer
2. Click **Contract** → **Verify and Publish**
3. Select: **Solidity (Single file)**
4. Compiler Version: `v0.8.20+commit.a1b79de6`
5. Optimization: **Yes**, Runs: `200`
6. Paste flattened source code
7. Paste ABI-encoded constructor arguments
8. Click **Verify and Publish**

### Method 3: Remix Etherscan Plugin

Easiest method but requires API key.

#### Step 1: Get Block Explorer API Key
- Polygonscan: https://polygonscan.com/apis
- Etherscan: https://etherscan.io/apis
- Arbiscan: https://arbiscan.io/apis

#### Step 2: Configure Plugin
1. In Remix, go to **Plugin Manager**
2. Activate **Etherscan - Contract Verification**
3. Enter your API key
4. Select the deployed contract
5. Click **Verify**

---

## Post-Deployment Configuration

### Step 1: Add to Admin UI
1. Go to **Admin → Flash Loan Providers**
2. Find the provider for your network
3. Click **Configure Receiver**
4. Enter the deployed contract address
5. Save

### Step 2: Test Flash Loan (Sepolia)
1. On the Flash Loan Providers page
2. Find Sepolia provider
3. Click **Test Sepolia Flash Loan**
4. Verify transaction succeeds

### Step 3: Whitelist Additional Routers (Optional)
If using routers other than 0x:
```solidity
// Call as contract owner
whitelistRouter(routerAddress, true);
```

### Step 4: Mark as Verified
After successful block explorer verification:
1. Click **Mark Verified** button
2. Confirm verification date is recorded

---

## Network-Specific Details

### Ethereum Mainnet
| Setting | Value |
|---------|-------|
| Chain ID | 1 |
| Pool Addresses Provider | `0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e` |
| Block Explorer | https://etherscan.io |
| Verification URL | https://etherscan.io/verifyContract |

### Ethereum Sepolia (Testnet)
| Setting | Value |
|---------|-------|
| Chain ID | 11155111 |
| Pool Addresses Provider | `0x012bAC54348C0E635dCAc9D5FB99f06F24136C9A` |
| Block Explorer | https://sepolia.etherscan.io |
| Faucet | https://sepoliafaucet.com |

### Polygon Mainnet
| Setting | Value |
|---------|-------|
| Chain ID | 137 |
| Pool Addresses Provider | `0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb` |
| Block Explorer | https://polygonscan.com |
| Verification URL | https://polygonscan.com/verifyContract |

### Polygon Amoy (Testnet)
| Setting | Value |
|---------|-------|
| Chain ID | 80002 |
| Pool Addresses Provider | `0x36616cf17557639614c1cdDb356b1B83fc0B2132` |
| Block Explorer | https://amoy.polygonscan.com |
| Faucet | https://faucet.polygon.technology |

### Arbitrum One (Mainnet)
| Setting | Value |
|---------|-------|
| Chain ID | 42161 |
| Pool Addresses Provider | `0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb` |
| Block Explorer | https://arbiscan.io |

### BSC Mainnet
| Setting | Value |
|---------|-------|
| Chain ID | 56 |
| Pool Addresses Provider | `0xff75B6da14FfbbfD355Daf7a2731456b3562Ba6D` |
| Block Explorer | https://bscscan.com |

---

## Security Checklist

Before enabling for production:

- [ ] **Owner address verified**: Confirm `owner()` returns expected admin wallet
- [ ] **0x Router whitelisted**: Default router is whitelisted on deployment
- [ ] **Test with small amounts**: Execute test flash loan with minimal value first
- [ ] **Contract verified**: Source code verified on block explorer
- [ ] **No pending owner transfer**: Check no unauthorized `transferOwnership` calls
- [ ] **Sufficient gas for callback**: Flash loan callback needs ~300k gas

### Emergency Procedures

#### Withdraw Stuck Tokens
```solidity
// As owner, call:
emergencyWithdraw(tokenAddress, amount);
```

#### Pause Operations
The contract doesn't have a pause function. To disable:
1. Remove receiver address from `flash_loan_providers` table
2. Set provider `is_active = false`

#### Transfer Ownership
```solidity
// As current owner:
transferOwnership(newOwnerAddress);
```

---

## Troubleshooting

### Verification Errors

| Error | Solution |
|-------|----------|
| "Bytecode doesn't match" | Check compiler version matches exactly (0.8.20) |
| "Constructor arguments mismatch" | Verify ABI-encoded address is correct |
| "Unable to locate ContractName" | Use Standard JSON Input method instead |
| "Invalid optimization settings" | Enable optimization with 200 runs |

### Deployment Errors

| Error | Solution |
|-------|----------|
| "Insufficient funds" | Add more native tokens for gas |
| "Contract creation failed" | Check constructor argument is valid address |
| "Gas estimation failed" | Increase gas limit manually |

### Flash Loan Execution Errors

| Error | Solution |
|-------|----------|
| "Router not whitelisted" | Call `whitelistRouter(address, true)` |
| "Insufficient repayment" | Arbitrage profit didn't cover flash fee |
| "Callback failed" | Check swap parameters and router approval |

---

## Dependencies

Required packages for local development:
```json
{
  "@aave/core-v3": "^1.19.0",
  "@openzeppelin/contracts": "^5.0.0"
}
```

---

## Support

For issues with:
- **Contract deployment**: Check Remix documentation
- **Block explorer verification**: Check respective explorer docs
- **MetallumX integration**: Review `AdminFlashLoanProvidersPage.tsx`
