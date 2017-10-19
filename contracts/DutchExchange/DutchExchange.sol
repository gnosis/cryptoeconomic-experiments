pragma solidity 0.4.15;

// only modification done by Alex:
// added
    // One has to buy the whole bribe at once!
    //  require(overflow>=0);

import "@gnosis.pm/gnosis-core-contracts/contracts/Tokens/StandardToken.sol";
// import "@gnosis.pm/gnosis-core-contracts/contracts/Tokens/Token.sol";

/// @title Dutch Exchange - exchange token pairs with the clever mechanism of the dutch auction
/// @author Dominik Teiml - <dominik.teiml@gnosis.pm>

contract DutchExchange {
    // This contract represents an exchange between two ERC20 tokens

    // The price is a rational number, so we need a concept of a fraction:
    struct fraction {
        // Numerator
        uint256 num;

        // Denominator
        uint256 den;
    }

    // If DX is running, this is the start time of that auction
    // If DX is cleared, this is the scheduled time of the next auction
    uint256 public auctionStart;

    // Tokens that are being traded
    Token public sellToken;
    // Usually ETH
    Token public buyToken;
    // DUTCHX tokens, used to vote on new token proposals
    Token public DUTCHX;

    // Index of the current auction. This is necessary to store closing prices (see next variable)
    uint256 public auctionIndex = 1;

    // The prices at which all auctions cleared, will influence the price scale of the next auction
    mapping (uint256 => fraction) public closingPrices;

    // Sell volume for current auction. Needed to determine when auction clears
    uint256 public sellVolumeCurrent;
    // Cumulative sell volume for next auction
    uint256 public sellVolumeNext;
    // Buy volumes for all auctions. Needed to display most busy auctions
    mapping (uint256 => uint256) public buyVolumes;

    // Seller balances for all auctions. The first uint256 is auction index
    // (needed because closing price could be different for each auction)
    mapping (uint256 => mapping (address => uint256)) public sellerBalances;
    // Buyer balances for current auction (usually in ETH)
    mapping (uint256 => mapping (address => uint256)) public buyerBalances;
    // Buyers can claim tokens while auction is running, so we need to store that
    mapping (uint256 => mapping (address => uint256)) public claimedAmounts;

    // By the way, sum of buyer/seller balances need not equal buy/sell volumes for
    // a specific auction, because the former is reset when a user claims their funds

    // Events
    event newSellOrder(uint256 indexed _auctionIndex, address indexed _from, uint256 amount);
    event newBuyOrder(uint256 indexed _auctionIndex, address indexed _from, uint256 amount);
    event newSellerFundsClaim(uint256 indexed _auctionIndex, address indexed _from, uint256 _returned);
    event newBuyerFundsClaim(uint256 indexed _auctionIndex, address indexed _from, uint256 _returned);
    event auctionCleared(uint256 _auctionIndex);

    // Constructor
    function DutchExchange(
        uint256 initialClosingPriceNum,
        uint256 initialClosingPriceDen,
        Token _sellToken,
        Token _buyToken,
        Token _DUTCHX
    ) public {
        // Calculate initial price
        fraction memory initialClosingPrice;
        initialClosingPrice.num = initialClosingPriceNum;
        initialClosingPrice.den = initialClosingPriceDen;
        closingPrices[0] = initialClosingPrice;

        // Set variables
        sellToken = _sellToken;
        buyToken = _buyToken;
        DUTCHX = _DUTCHX;
        scheduleNextAuction();
    }

    function clearAuction(uint256 currentPriceNum, uint256 currentPriceDen)
        public
        returns (bool success)
    {
        // Update state variables
        closingPrices[auctionIndex].num = currentPriceNum;
        closingPrices[auctionIndex].den = currentPriceDen;
        sellVolumeCurrent = sellVolumeNext;
        sellVolumeNext = 0;
        auctionIndex++;

        auctionCleared(auctionIndex - 1);
        success = true;
    }

    function postSellOrder(uint256 amount) public returns (bool success) {
        require(sellToken.transferFrom(msg.sender, this, amount));

        if (auctionStart <= now) {
            // There is an active auction, we add sell order to next auction
            sellerBalances[auctionIndex + 1][msg.sender] += amount;
            sellVolumeNext += amount;
        } else {
            // No active auction, we add it to the scheduled auction
            sellerBalances[auctionIndex][msg.sender] += amount;
            sellVolumeCurrent += amount;
        }

        newSellOrder(auctionIndex, msg.sender, amount);
        success = true;
    }

    function postBuyOrder(uint256 amount, uint256 _auctionIndex)
        public
    {
        // User inputs the current auction index, this is a fail-safe in case
        // his/her transaction is mined after the auction clears
        require(auctionIndex == _auctionIndex);
        require(auctionStart <= now);

        // Get current price to calculate overflow
        uint256 num;
        uint256 den;
        (num, den) = getPrice(_auctionIndex);

        // Calculate if buy order overflows
        int256 overflow = int256(buyVolumes[_auctionIndex] + amount - sellVolumeCurrent * num / den);

        // One has to buy the whole bribe at once!
        require(overflow>=0);

        // Calculate amount without overflow
        if (overflow > 0) {
            uint256 overflowPositive = uint256(overflow);
            amount -= overflowPositive;
        }

        // Perform transfer
        require(buyToken.transferFrom(msg.sender, this, amount));
        buyVolumes[auctionIndex] += amount;
        buyerBalances[auctionIndex][msg.sender] += amount;

        newBuyOrder(auctionIndex, msg.sender, amount);

        // Clear auction
        if (overflow >= 0) {
            clearAuction(num, den);
            scheduleNextAuction();
        }
    }

    function claimSellerFunds(uint256 _auctionIndex) public returns (uint256 returned) {
        uint256 sellerBalance = sellerBalances[_auctionIndex][msg.sender];

        // Checks if particular auction has cleared
        require(auctionIndex > _auctionIndex);
        require(sellerBalance > 0);

        // Get closing price for said auction
        fraction memory closingPrice = closingPrices[_auctionIndex];
        uint256 num = closingPrice.num;
        uint256 den = closingPrice.den;

        // Perform transfer
        returned = sellerBalance * num / den;
        sellerBalances[_auctionIndex][msg.sender] = 0;
        require(buyToken.transfer(msg.sender, returned));
        newSellerFundsClaim(_auctionIndex, msg.sender, returned);
    }

    function claimBuyerFunds(uint256 _auctionIndex)
        public
        returns
        (uint256 returned)
    {
        uint256 buyerBalance = buyerBalances[_auctionIndex][msg.sender];

        // Checks if particular auction has ever run
        require(auctionIndex >= _auctionIndex);

        uint256 num;
        uint256 den;

        // User has called a running auction
        if (auctionIndex == _auctionIndex) {
            (num, den) = getPrice(_auctionIndex);
        } else {
            // User has called a cleared auction, so we need its closing price:
            fraction memory closingPrice = closingPrices[_auctionIndex];
            num = closingPrice.num;
            den = closingPrice.den;
        }

        // Get amount to return
        returned = buyerBalance * den / num - claimedAmounts[_auctionIndex][msg.sender];
        require(returned > 0);

        // Perform transfer
        claimedAmounts[auctionIndex][msg.sender] += returned;
        require(sellToken.transfer(msg.sender, returned));
        newBuyerFundsClaim(_auctionIndex, msg.sender, returned);
    }

    function getPrice(uint256 _auctionIndex)
        public
        constant
        returns (uint256 num, uint256 den)
    {
        // Checks if particular auction has ever run
        require(auctionIndex >= _auctionIndex);

        if (auctionIndex > _auctionIndex) {
            // Auction has closed
            fraction memory closingPrice = closingPrices[_auctionIndex];
            num = closingPrice.num;
            den = closingPrice.den;
        } else {
            // Auction is running, we need to calculate current price
            // by first getting the last closing price
            fraction memory lastClosingPrice = closingPrices[_auctionIndex - 1];
            uint256 numOfLastClosingPrice = lastClosingPrice.num;
            uint256 denOfLastClosingPrice = lastClosingPrice.den;

            // The numbers 36k and 18k are chosen, so the initial price is double the last closing price
            // And after 5 hours (18000 s), the price is the same as last closing price
            num = 36000 * numOfLastClosingPrice;
            den = (now - auctionStart + 18000) * denOfLastClosingPrice;
        }
    }

    function scheduleNextAuction() internal {
        // Number of elapsed 6-hour periods since 1/1/1970
        uint256 elapsedPeriods = now / 1 hours / 6;
        // Set start period to following one
        auctionStart = (elapsedPeriods + 1) * 6 * 1 hours;
    }
}
