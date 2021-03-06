pragma solidity 0.4.15;
import "@gnosis.pm/gnosis-core-contracts/contracts/Oracles/Oracle.sol";
import "@gnosis.pm/gnosis-core-contracts/contracts/Markets/StandardMarketWithPriceLogger.sol";


/// @title Difficulty oracle contract - Oracle to resolve difficulty events at given block
/// @author Stefan George - <stefan@gnosis.pm>
contract PriceFromContractsOracle is Oracle {

    /*
     *  Events
     */
    event OutcomeAssignment(int difficulty);

    /*
     *  Storage
     */
    uint public blockNumber;
    int public priceDifference=0;
    address public creator;
    address public inputContractAddress1;
    address public inputContractAddress2;
    bool public inputAddressesSet;
    bool public outcomeIsSet;

    /*
     *  Modifier
     */

    modifier isCreator() {
       // Only creator is allowed to proceed
       require(msg.sender == creator);
       _;
   }

    /*
     *  Public functions
     */
         //Difficulty is set manully, since testrpc has difficlty =0 const
    /// @dev Contract constructor validates and sets target block number
    /// @param _blockNumber Target block number
    function PriceFromContractsOracle(uint _blockNumber)
        public
    {
        // Block has to be in the future
        require(_blockNumber > block.number);
        blockNumber = _blockNumber;
        inputAddressesSet=false;
        creator=msg.sender;
    }
    function setInputAddress( address _inputContractAddress1, address _inputContractAddress2)
    public
    isCreator
    {
      require(_inputContractAddress1!=0x0 &&_inputContractAddress2!=0x0);
      require(inputContractAddress1==0x0 &&inputContractAddress2==0x0);
      inputContractAddress1=_inputContractAddress1;
      inputContractAddress2=_inputContractAddress2;
      }

    //Difficulty is set manully, since testrpc has difficlty =0 const
    /// @dev Sets difficulty as winning outcome for specified block
    function setOutcome()
        public
    {
        // Block numbe  r was reached and outcome was not set yet
        require(block.number >= blockNumber && !outcomeIsSet);
        uint p1=StandardMarketWithPriceLogger(inputContractAddress1).getAvgPrice();
        uint p2=StandardMarketWithPriceLogger(inputContractAddress2).getAvgPrice();
        if(p1>p2)
          priceDifference=int(p1-p2);
        else
          priceDifference=-1*int(p2-p1);
        outcomeIsSet=true;
        OutcomeAssignment(priceDifference);
    }

    /// @dev Returns if difficulty is set
    /// @return Is outcome set?
    function isOutcomeSet()
        public
        constant
        returns (bool)
    {
        // Difficulty is always bigger than 0
        return  outcomeIsSet;
    }

    /// @dev Returns difficulty
    /// @return Outcome
    function getOutcome()
        public
        constant
        returns (int)
    {
        return int(priceDifference);
    }
}
