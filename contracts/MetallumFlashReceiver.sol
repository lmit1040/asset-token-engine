// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@aave/core-v3/contracts/flashloan/base/FlashLoanSimpleReceiverBase.sol";
import "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";
// Use OpenZeppelin v4.9.3 for compatibility with Aave V3 dependencies
import "@openzeppelin/contracts@4.9.3/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts@4.9.3/access/Ownable.sol";
import "@openzeppelin/contracts@4.9.3/security/ReentrancyGuard.sol";

/**
 * @title MetallumFlashReceiver
 * @notice Flash loan receiver contract for atomic arbitrage execution on EVM chains
 * @dev Implements Aave V3 flash loan interface for capital-free arbitrage
 * 
 * DEPLOYMENT ADDRESSES:
 * - Polygon: Deploy with Aave V3 Pool Provider: 0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb
 * - Ethereum: Deploy with Aave V3 Pool Provider: 0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e
 * - Arbitrum: Deploy with Aave V3 Pool Provider: 0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb
 * - BSC: Deploy with Aave V3 Pool Provider: 0xff75B6da14FfbbfD355Daf7a2731456b3562Ba6D
 * 
 * USAGE:
 * 1. Deploy this contract with the appropriate Aave V3 Pool Addresses Provider
 * 2. Call executeFlashLoanArbitrage() with:
 *    - borrowAsset: Token to borrow (e.g., USDC)
 *    - borrowAmount: Amount to borrow
 *    - router: DEX router address (e.g., 0x API exchange proxy)
 *    - swapData: Encoded swap calldata for the arbitrage
 * 3. Contract borrows, executes swap, repays loan + premium, keeps profit
 * 
 * SECURITY:
 * - Only owner can execute flash loans
 * - Only owner can withdraw profits
 * - Reentrancy protection enabled
 * - Whitelist for approved routers
 */
contract MetallumFlashReceiver is FlashLoanSimpleReceiverBase, Ownable, ReentrancyGuard {
    
    // Events
    event FlashLoanExecuted(
        address indexed asset,
        uint256 amount,
        uint256 premium,
        uint256 profit
    );
    event RouterWhitelisted(address indexed router, bool status);
    event ProfitWithdrawn(address indexed token, uint256 amount);
    
    // Whitelisted DEX routers for swap execution
    mapping(address => bool) public whitelistedRouters;
    
    // Temporary storage for flash loan execution context
    struct FlashLoanContext {
        address router;
        bytes swapData;
        uint256 expectedMinReturn;
    }
    FlashLoanContext private _pendingContext;
    
    constructor(
        IPoolAddressesProvider _addressesProvider
    ) FlashLoanSimpleReceiverBase(_addressesProvider) Ownable() {
        // OpenZeppelin v4.x Ownable() sets msg.sender as owner automatically
        // Whitelist common DEX routers by default
        // 0x Exchange Proxy (same on all EVM chains)
        whitelistedRouters[0xDef1C0ded9bec7F1a1670819833240f027b25EfF] = true;
    }
    
    /**
     * @notice Set router whitelist status
     * @param router The router address
     * @param status True to whitelist, false to remove
     */
    function setRouterWhitelist(address router, bool status) external onlyOwner {
        whitelistedRouters[router] = status;
        emit RouterWhitelisted(router, status);
    }
    
    /**
     * @notice Execute a flash loan arbitrage
     * @param borrowAsset The asset to borrow
     * @param borrowAmount The amount to borrow
     * @param router The DEX router to use for swaps
     * @param swapData The encoded swap calldata
     * @param expectedMinReturn Minimum expected return after swap (slippage protection)
     */
    function executeFlashLoanArbitrage(
        address borrowAsset,
        uint256 borrowAmount,
        address router,
        bytes calldata swapData,
        uint256 expectedMinReturn
    ) external onlyOwner nonReentrant {
        require(whitelistedRouters[router], "Router not whitelisted");
        require(borrowAmount > 0, "Amount must be > 0");
        
        // Store context for the callback
        _pendingContext = FlashLoanContext({
            router: router,
            swapData: swapData,
            expectedMinReturn: expectedMinReturn
        });
        
        // Request flash loan from Aave V3
        // referralCode = 0 (no referral)
        POOL.flashLoanSimple(
            address(this),  // receiverAddress
            borrowAsset,    // asset
            borrowAmount,   // amount
            "",             // params (not used, we use _pendingContext)
            0               // referralCode
        );
        
        // Clear context
        delete _pendingContext;
    }
    
    /**
     * @notice Aave V3 flash loan callback
     * @dev This function is called by the Aave Pool after receiving the flash borrowed amount
     * @param asset The address of the flash-borrowed asset
     * @param amount The amount of the flash-borrowed asset
     * @param premium The fee of the flash-borrowed asset
     * @param initiator The address initiating the flash loan
     * @param params Additional parameters (unused, we use _pendingContext)
     * @return True if the execution was successful
     */
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external override returns (bool) {
        // Security checks
        require(msg.sender == address(POOL), "Caller must be Pool");
        require(initiator == address(this), "Initiator must be this contract");
        
        // Retrieve execution context
        FlashLoanContext memory ctx = _pendingContext;
        require(ctx.router != address(0), "No pending context");
        
        // Record balance before swap
        uint256 balanceBefore = IERC20(asset).balanceOf(address(this));
        
        // Approve router to spend borrowed amount
        IERC20(asset).approve(ctx.router, amount);
        
        // Execute the arbitrage swap via the router
        (bool success, ) = ctx.router.call(ctx.swapData);
        require(success, "Swap execution failed");
        
        // Check balance after swap
        uint256 balanceAfter = IERC20(asset).balanceOf(address(this));
        
        // Calculate the amount owed (borrowed + premium)
        uint256 amountOwed = amount + premium;
        
        // Verify we have enough to repay and meet minimum return
        require(balanceAfter >= amountOwed, "Insufficient return to repay loan");
        require(balanceAfter >= ctx.expectedMinReturn, "Below minimum expected return");
        
        // Calculate profit
        uint256 profit = balanceAfter - amountOwed;
        
        // Approve the Pool to pull the owed amount
        IERC20(asset).approve(address(POOL), amountOwed);
        
        emit FlashLoanExecuted(asset, amount, premium, profit);
        
        return true;
    }
    
    /**
     * @notice Withdraw accumulated profits
     * @param token The token to withdraw
     * @param amount The amount to withdraw (0 for entire balance)
     */
    function withdrawProfits(address token, uint256 amount) external onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        uint256 withdrawAmount = amount == 0 ? balance : amount;
        
        require(withdrawAmount <= balance, "Insufficient balance");
        require(IERC20(token).transfer(owner(), withdrawAmount), "Transfer failed");
        
        emit ProfitWithdrawn(token, withdrawAmount);
    }
    
    /**
     * @notice Withdraw native currency (ETH/MATIC/BNB)
     */
    function withdrawNative() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No native balance");
        
        (bool success, ) = owner().call{value: balance}("");
        require(success, "Native transfer failed");
    }
    
    /**
     * @notice Emergency function to rescue stuck tokens
     * @param token The token to rescue
     * @param to The recipient address
     * @param amount The amount to rescue
     */
    function rescueTokens(address token, address to, uint256 amount) external onlyOwner {
        require(to != address(0), "Invalid recipient");
        require(IERC20(token).transfer(to, amount), "Rescue transfer failed");
    }
    
    /**
     * @notice Get flash loan premium rate from Aave Pool
     * @return The premium rate in basis points (e.g., 5 = 0.05%)
     */
    function getFlashLoanPremium() external view returns (uint128) {
        return POOL.FLASHLOAN_PREMIUM_TOTAL();
    }
    
    /**
     * @notice Check if this contract can receive native currency
     */
    receive() external payable {}
}
