pragma solidity 0.4.15;
import "@gnosis.pm/gnosis-core-contracts/contracts/Oracles/Oracle.sol";
import "@gnosis.pm/gnosis-core-contracts/contracts/Markets/StandardMarketWithPriceLogger.sol";


/// @title Difficulty oracle contract - Oracle to resolve difficulty events at given block
/// @author Stefan George - <stefan@gnosis.pm>
contract PriceFromContractsOraclePlusRandomization is Oracle{
      using Math for *;


    /*
     *  Events
     */
    event OutcomeAssignment(uint outcome);
    event A(bytes32 a);
    /*
     *  Storage
     */
    uint public blockNumber;
    uint public outcome;
    address public creator;
    address public inputContractAddress1;
    address public inputContractAddress2;
    bool public inputAddressesSet;
    bool public outcomeIsSet;
    bytes32 public hashedRandomNr;
    uint constant ONE = 0x10000000000000000;

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
    function PriceFromContractsOraclePlusRandomization(uint _blockNumber, bytes32 _encryptedRandomNr)
        public
    {
        // Block has to be in the future
        require(_blockNumber > block.number);
        blockNumber = _blockNumber;
        inputAddressesSet=false;
        creator=msg.sender;
        hashedRandomNr= _encryptedRandomNr;
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
    function setOutcome(uint nrToBeRevealed, bytes32 key)
        public
    {
        // Block number was reached and outcome was not set yet
        require(block.number >= blockNumber && ! outcomeIsSet);

        require(sha3(nrToBeRevealed,key)==hashedRandomNr);
        //A(sha3(nrToBeRevealed,key));
        uint nrFromBlock=uint(block.blockhash(blockNumber));
        //calculation in per thousand not per cent.
        uint randomNr=addmod(nrFromBlock, nrToBeRevealed, 1000);
        uint p1=StandardMarketWithPriceLogger(inputContractAddress1).getAvgPrice();
        uint p2=StandardMarketWithPriceLogger(inputContractAddress2).getAvgPrice();
        //Since it is very very unlikely to happen, we simply do not care about the edge case p1==p2 we simply give the option p2 the go
        //require(p1!=p2);

        int differenceInPercentage;
        if(p1>p2){
            differenceInPercentage=int((p1-p2)*100/((p1+p2)/2));
        }
        else {
          differenceInPercentage=int((p2-p1)*100/((p1+p2)/2));
        }
        //1/2*e^-(2x) desribes the probability for the lesser probale event to be chosen.

        uint probabilityForLowerEvent=Math.exp(-2*differenceInPercentage)*1000/ONE/2;
        if(differenceInPercentage>40){
          if(p1>p2)
           outcome=0;
           else
           outcome=1;
        }
        else{
          if(p1>p2){
            if(randomNr>probabilityForLowerEvent) outcome=0;
            else outcome=1;
          }
           else{
           if(randomNr>probabilityForLowerEvent) outcome=1;
           else outcome=0;
          }
        }

        outcomeIsSet=true;
        OutcomeAssignment(outcome);
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
        return int(outcome);
    }
}
