const utils = require('@gnosis.pm/gnosis-core-contracts/test/javascript/utils')

const { wait } = require('@digix/tempo')(web3)

const EtherToken = artifacts.require('@gnosis.pm/gnosis-core-contracts/contracts/Tokens/EtherToken')
const DifficultyOracle = artifacts.require('DifficultyOracle')
const DifficultyPlusFivePercentOracle = artifacts.require('DifficultyPlusFivePercentOracle')
const DifficultyOracleFactory = artifacts.require('@gnosis.pm/gnosis-core-contracts/contractsOracles/DifficultyOracleFactory')
const StandardMarketWithPriceLogger = artifacts.require('@gnosis.pm/gnosis-core-contracts/contracts/Markets/StandardMarketWithPriceLogger')
const StandardMarketWithPriceLoggerFactory=artifacts.require('@gnosis.pm/gnosis-core-contracts/contracts/Markets/StandardMarketWithPriceLoggerFactory');
const LMSRMarketMaker = artifacts.require('@gnosis.pm/gnosis-core-contracts/contracts/MarketMakers/LMSRMarketMaker')
const ScalarEvent = artifacts.require('@gnosis.pm/gnosis-core-contracts/contracts/Events/ScalarEvent')
const Token = artifacts.require('@gnosis.pm/gnosis-core-contracts/contracts/Tokens/Token')
const EventFactory=artifacts.require('@gnosis.pm/gnosis-core-contracts/contracts/Events/EventFactory')
const PriceFromContractsOracle=artifacts.require('PriceFromContractsOracle')

const contracts = [EtherToken, DifficultyOracle, DifficultyOracleFactory,  StandardMarketWithPriceLogger, LMSRMarketMaker, ScalarEvent]
ETHER=1000000000000000000;
    ETHER=1; //just for easier testing;


contract('Experiemnt3A', function (accounts) {
    let centralizedOracleFactory
    let difficultyOracleFactory
    let eventFactory
    let lmsrMarketMaker
    let etherToken
    let ipfsHash, ipfsBytes
    let spreadMultiplier, challengePeriod, challengeAmount, frontRunnerPeriod
    let fee, deadline, funding, startDate
    let currentDifficulty,lowerBoundaryDifficulty,upperBoundaryDifficulty,additionalFivePercentForSecondMarket;
    let nrOfBlockTwoWeeks
    let lsmrFunding,manipulatorReward
    before(utils.createGasStatCollectorBeforeHook(contracts))
    after(utils.createGasStatCollectorAfterHook(contracts))

    beforeEach(async () => {
        // deployed factory contracts
        difficultyOracleFactory = await DifficultyOracleFactory.deployed()
        standardMarketWithPriceLoggerFactory=await StandardMarketWithPriceLoggerFactory.deployed();
        etherToken = await EtherToken.deployed()
        //eventFactory=await eventFactory.deployed();

        //Experiment Setup variables:
        currentDifficulty=2838;
	       //const currentDifficulty=web3.eth.getBlock('latest').difficulty;
        lowerBoundaryDifficulty=parseInt(currentDifficulty*0.82);
        upperBoundaryDifficulty=parseInt(currentDifficulty*1.33);
        additionalFivePercentForSecondMarket=Math.floor((upperBoundaryDifficulty-lowerBoundaryDifficulty)/20);

        // Futarchy oracle stuff
	      startingBlock=
        fee = 500000 // 5%
        funding = 10**18 // 1 ETH
        startDate = 0
	      nrOfBlockTwoWeeks=4*60*24*14;
        deadline = 100 // 100s
        nrOfBlockTwoWeeks=100;//just for easier testing

        lsmrFunding=1*ETHER;
        manipulatorReward=10*ETHER;

            //targetblock should be two weeks later.
             targetBlock = (await web3.eth.getBlock('latest')).number + nrOfBlockTwoWeeks;

            //Creation of first difficultyMarket
            difficultyOracle = utils.getParamFromTxEvent(
                await difficultyOracleFactory.createDifficultyOracle(targetBlock),
                'difficultyOracle', DifficultyOracle
            )
                const lmsrMarketMakerNormalDifficulty= await LMSRMarketMaker.new();
            const normalDifficultyEvent=await ScalarEvent.new(etherToken.address,difficultyOracle.address,lowerBoundaryDifficulty,upperBoundaryDifficulty);
            const normalDifficultyMarket=utils.getParamFromTxEvent(
            await standardMarketWithPriceLoggerFactory.createMarket(normalDifficultyEvent.address, lmsrMarketMakerNormalDifficulty.address, fee, startDate,{from:accounts[0]}),
              'market',StandardMarketWithPriceLogger
            );
            await etherToken.deposit({from: accounts[0],value: lsmrFunding});
            await etherToken.approve(normalDifficultyMarket.address,lsmrFunding,{from:accounts[0]});
            await normalDifficultyMarket.fund(lsmrFunding);
            assert.equal(await normalDifficultyMarket.funding(),lsmrFunding);
            console.log("frist difficultyMarket created");

            // Creation of second  difficultyPlusFivePercent market
            const lmsrMarketMakerPlusFivePercentDifficulty= await LMSRMarketMaker.new();
    	       difficultyPlusFivePercentOracle=await DifficultyPlusFivePercentOracle.new(targetBlock,additionalFivePercentForSecondMarket);
            const difficultyPlusFivePercentEvent=await ScalarEvent.new(etherToken.address,difficultyPlusFivePercentOracle.address,lowerBoundaryDifficulty,upperBoundaryDifficulty);
            const difficultyPlusFivePercentMarket=utils.getParamFromTxEvent(
            await standardMarketWithPriceLoggerFactory.createMarket(difficultyPlusFivePercentEvent.address, lmsrMarketMakerPlusFivePercentDifficulty.address, fee, startDate,{from:accounts[0]}),
            'market',StandardMarketWithPriceLogger
             );
            await etherToken.deposit({from: accounts[0],value: lsmrFunding});
            await etherToken.approve(difficultyPlusFivePercentMarket.address,lsmrFunding);
            await difficultyPlusFivePercentMarket.fund(lsmrFunding);
            assert.equal(await difficultyPlusFivePercentMarket.funding(),lsmrFunding);
            console.log("Second market created");

            //Creation of manipulation event rewards.
            const lmsrMarketMaker= await LMSRMarketMaker.new();
    	      const avgPriceOracle= await PriceFromContractsOracle.new(targetBlock);
            await avgPriceOracle.setInputAddress(normalDifficultyMarket.address,difficultyPlusFivePercentMarket.address);
            console.log("installed oracles");
            const boundary=(upperBoundaryDifficulty-lowerBoundaryDifficulty)/10;
            const bribaryEvent=await ScalarEvent.new(etherToken.address,avgPriceOracle.address,-boundary,boundary);
            const bribaryMarket=utils.getParamFromTxEvent(
            await standardMarketWithPriceLoggerFactory.createMarket(bribaryEvent.address, lmsrMarketMaker.address, fee, startDate,{from:accounts[0]}),
            'market',StandardMarketWithPriceLogger
             );
             await etherToken.deposit({from: accounts[0],value: manipulatorReward});
             await etherToken.approve(bribaryEvent.address,manipulatorReward);
             await bribaryEvent.buyAllOutcomes(manipulatorReward);
             console.log("Bribe installed created");

    })

        it('should test difficulty oracle setup: too early resolving', async () => {
            // Creation of first difficulty market
            await utils.assertRejects(difficultyOracle.setOutcome(0, {from: accounts[0]}))
            await utils.assertRejects(difficultyPlusFivePercentOracle.setOutcome(0, {from: accounts[0]}))
            assert.equal(await difficultyOracle.isOutcomeSet(), false)
            assert.equal(await difficultyPlusFivePercentOracle.isOutcomeSet(), false)

        })

            it('should test difficulty oracle setup: oracle input after two weeks', async () => {
                // Create difficulty oracle

                // TODO: TestRPC difficulty is 0, so these tests won't pass there

                // // Wait until block 100
                //await waitUntilBlock(20, targetBlock)
                for(var i=0;i<nrOfBlockTwoWeeks;i++){
                  await mineBlock();
                }
                  randomNr=Math.floor(Math.random()*1000)%100;

                 await difficultyOracle.setOutcome((currentDifficulty+randomNr) );
                 await difficultyPlusFivePercentOracle.setOutcome(currentDifficulty+randomNr);

                 assert.equal(await difficultyOracle.isOutcomeSet(), true);
                 assert.equal(await difficultyOracle.getOutcome(), (currentDifficulty+randomNr) );

                 assert.equal(await difficultyPlusFivePercentOracle.isOutcomeSet(), true);
                 assert.equal(await difficultyPlusFivePercentOracle.getOutcome(), (currentDifficulty+randomNr+additionalFivePercentForSecondMarket) );
            })

    it('should test futarchy oracle', async () => {

        // Buy into market for outcome token 1
        const buyer = 1
        const outcome = 1
        const tokenCount = 1e15

        const outcomeTokenCost = await lmsrMarketMakerNormalDifficulty.calcCost(market.address, outcome, tokenCount)
        let marketfee = await normalDifficultyMarket.calcMarketFee(outcomeTokenCost)
        const cost = marketfee.add(outcomeTokenCost)

        // Buy all outcomes
        await etherToken.deposit({ value: cost, from: accounts[buyer] })
        assert.equal(await etherToken.balanceOf(accounts[buyer]), cost.valueOf())
        await etherToken.approve(normalDifficultyEvent.address, cost, { from: accounts[buyer] })
        await normalDifficultyEvent.buyAllOutcomes(cost, { from: accounts[buyer] })

        // Buy long tokens from market 1
        const collateralToken = Token.at(await normalDifficultyEvent.outcomeTokens(1))
        await collateralToken.approve(normalDifficultyMarket.address, cost, { from: accounts[buyer] })

        assert.equal(utils.getParamFromTxEvent(
            await normalDifficultyMarket.buy(outcome, tokenCount, cost, { from: accounts[buyer] }), 'outcomeTokenCost'
        ), outcomeTokenCost.valueOf())

        // Set outcome of futarchy oracle
        await wait(targetBlock)
        randomNr=Math.floor(Math.random()*1000)%100;

       await difficultyOracle.setOutcome((currentDifficulty+randomNr) );
       await difficultyPlusFivePercentOracle.setOutcome(currentDifficulty+randomNr);
        await categoricalEvent.setOutcome()

        // Set winning outcome for scalar events
        await utils.assertRejects(
            futarchyOracle.close(),
            'Futarchy oracle cannot be closed if oracle for scalar market is not set')
        await centralizedOracle.setOutcome(-50)
        const scalarEvent = ScalarEvent.at(await market.eventContract())
        await scalarEvent.setOutcome()

        // Close winning market and transfer collateral tokens to creator
        await futarchyOracle.close({ from: accounts[creator] })
        assert.isAbove(await etherToken.balanceOf(accounts[creator]), funding)
    })

  })
const mineBlock = async function () {
return new Promise((resolve, reject) => {
web3.currentProvider.sendAsync({
jsonrpc: "2.0",
method: "evm_mine"
}, (err, result) => {
if(err){ return reject(err) }
return resolve(result)
});
})
}
