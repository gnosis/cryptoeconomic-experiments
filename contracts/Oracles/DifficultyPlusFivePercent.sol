pragma solidity 0.4.15;
import "@gnosis.pm/gnosis-core-contracts/contracts/Oracles/Oracle.sol";


/// @title Difficulty oracle contract - Oracle to resolve difficulty events at given block
/// @author Stefan George - <stefan@gnosis.pm>
contract DifficultyPlusFivePercentOracle is Oracle {

    /*
     *  Events
     */
    event OutcomeAssignment(uint difficulty);

    /*
     *  Storage
     */
    uint public blockNumber;
    uint public difficultyPlusFivePercent;
    uint public fivePercentAddition;
    /*
     *  Public functions
     */
    /// @dev Contract constructor validates and sets target block number
    /// @param _blockNumber Target block number
    function DifficultyPlusFivePercentOracle(uint _blockNumber)
        public
    {
        // Block has to be in the future
        require(_blockNumber > block.number);
        blockNumber = _blockNumber;
    }

    //Difficulty is set manully, since testrpc has difficlty =0 const
    /// @dev Sets difficulty as winning outcome for specified block
    function setOutcome(uint _difficulty)
        public
    {
        // Block number was reached and outcome was not set yet
        require(block.number >= blockNumber && difficultyPlusFivePercent == 0);
        difficultyPlusFivePercent = block.difficulty*21/20;
        //TODO remove this line;
        difficultyPlusFivePercent = _difficulty*21/20;
        OutcomeAssignment(difficultyPlusFivePercent);
    }

    /// @dev Returns if difficulty is set
    /// @return Is outcome set?

    function isOutcomeSet()
        public
        constant
        returns (bool)
    {
        // Difficulty is always bigger than 0
        return difficultyPlusFivePercent>0;
    }

    /// @dev Returns difficulty
    /// @return Outcome
    function getOutcome()
        public
        constant
        returns (int)
    {
        return int(difficultyPlusFivePercent);
    }
}
