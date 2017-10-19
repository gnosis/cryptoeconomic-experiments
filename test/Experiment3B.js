const utils = require('@gnosis.pm/gnosis-core-contracts/test/javascript/utils')

//const { wait } = require('@digix/tempo')(web3)
const { wait, waitUntilBlock } = require('@digix/tempo')(web3)
const EtherToken = artifacts.require('@gnosis.pm/gnosis-core-contracts/contracts/Tokens/EtherToken')
const DifficultyOracleFactory = artifacts.require('@gnosis.pm/gnosis-core-contracts/contractsOracles/DifficultyOracleFactory')
//const StandardMarketWithPriceLogger = artifacts.require('@gnosis.pm/gnosis-core-contracts/contracts/Markets/StandardMarketWithPriceLogger')
const StandardMarketWithPriceLogger = artifacts.require('StandardMarketWithPriceLogger')
const DutchExchange=artifacts.require('DutchExchange')
const StandardMarketWithPriceLoggerFactory=artifacts.require('@gnosis.pm/gnosis-core-contracts/contracts/Markets/StandardMarketWithPriceLoggerFactory');
const LMSRMarketMaker = artifacts.require('@gnosis.pm/gnosis-core-contracts/contracts/MarketMakers/LMSRMarketMaker')
const ScalarEvent = artifacts.require('@gnosis.pm/gnosis-core-contracts/contracts/Events/ScalarEvent')
const Token = artifacts.require('@gnosis.pm/gnosis-core-contracts/contracts/Tokens/Token')
const OutcomeToken=artifacts.require('@gnosis.pm/gnosis-core-contracts/contracts/Tokens/OutcomeToken')
const EventFactory=artifacts.require('@gnosis.pm/gnosis-core-contracts/contracts/Events/EventFactory')
const CategoricalEvent=artifacts.require('@gnosis.pm/gnosis-core-contracts/contracts/Events/CategoricalEvent')

const DifficultyOracle = artifacts.require('DifficultyOracle')
const DifficultyPlusFivePercentOracle = artifacts.require('DifficultyPlusFivePercentOracle')
const PriceFromContractsOracle=artifacts.require('PriceFromContractsOracle')
const PriceComparisionFromContractsOracle=artifacts.require('PriceComparisionFromContractsOracle')


let ETHER=10**18;
    ETHER=10**12; //just for easier testing;


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
    let nrOfBlockTwoWeeks,categoricalFunding
    let lsmrFunding,manipulatorReward
    let avgPriceOracleForCategoricalEvent,higherMarketPriceEvent
    let difficultyPlusFivePercentEvent,difficultyPlusFivePercentMarket

    beforeEach(async () => {
        // deployed factory contracts
        difficultyOracleFactory = await DifficultyOracleFactory.deployed()
        standardMarketWithPriceLoggerFactory = await StandardMarketWithPriceLoggerFactory.deployed();
        etherToken = await EtherToken.deployed()

        //Experiment Setup variables:
        currentDifficulty = 2838;
	       //const currentDifficulty=web3.eth.getBlock('latest').difficulty;
        lowerBoundaryDifficulty=parseInt(currentDifficulty*0.98);
        upperBoundaryDifficulty=parseInt(currentDifficulty*1.20);

        // Futarchy oracle stuff
        fee = 500000 // 5%
        startDate=0;
	      nrOfBlockTwoWeeks=4*60*24*14;
        nrOfBlockTwoWeeks=100;//just for easier testing
        lsmrFunding=1*ETHER;
        manipulatorReward=10*ETHER;
        categoricalFunding=lsmrFunding*2;
        targetBlock = (await web3.eth.getBlock('latest')).number + nrOfBlockTwoWeeks;  // when the Experiment will End
        targetBlockEndMarkets=(await web3.eth.getBlock('latest')).number + nrOfBlockTwoWeeks/2; // when the Markets will close

        //Deployment of Contracts:
        //

        //Creation of Conditional Tokens with a CategoricalEvent
       avgPriceOracleForCategoricalEvent = await PriceComparisionFromContractsOracle.new(targetBlock);
       higherMarketPriceEvent = await CategoricalEvent.new(etherToken.address,avgPriceOracleForCategoricalEvent.address,2);
       await etherToken.deposit({from: accounts[0],value: categoricalFunding});
       await etherToken.approve(higherMarketPriceEvent.address,categoricalFunding,{from:accounts[0]});
       await higherMarketPriceEvent.buyAllOutcomes(categoricalFunding);
       console.log("conditional Tokens created")

       // Creation of frist DifficultyMarket
        difficultyOracle = utils.getParamFromTxEvent(
            await difficultyOracleFactory.createDifficultyOracle(targetBlock),
            'difficultyOracle', DifficultyOracle
        )
        lmsrMarketMaker = await LMSRMarketMaker.new();
        conditionalTokensforMarketAAddress = (await higherMarketPriceEvent.outcomeTokens(0));
        normalDifficultyEvent = await ScalarEvent.new(conditionalTokensforMarketAAddress,difficultyOracle.address,lowerBoundaryDifficulty,upperBoundaryDifficulty);
        normalDifficultyMarket = utils.getParamFromTxEvent(
        await standardMarketWithPriceLoggerFactory.createMarket(normalDifficultyEvent.address, lmsrMarketMaker.address, fee, startDate,{from:accounts[0]}),
          'market',StandardMarketWithPriceLogger
        );

        await OutcomeToken.at(conditionalTokensforMarketAAddress).approve(normalDifficultyMarket.address,lsmrFunding,{from:accounts[0]});
        await normalDifficultyMarket.fund(lsmrFunding);
        assert.equal(await normalDifficultyMarket.funding(),lsmrFunding);
        //1 / (1+exp(q/b))difficulty*0.22+difficulty*0.98=difficulty+difficulty*0.05
        //1 / (1+sum(exp(q/b))=0.07/0.22
        //b=lsmrFunding /ln(2)
        //q=0.76214 b
        await buyInFutrachyMarket(normalDifficultyMarket, lmsrMarketMaker,0,Math.floor(0.76214005204/Math.log(2)*lsmrFunding), 0, etherToken, higherMarketPriceEvent, 0,accounts) ;
        a=parseInt(await lmsrMarketMaker.calcMarginalPrice(normalDifficultyMarket.address, 0));
        b=parseInt(await lmsrMarketMaker.calcMarginalPrice(normalDifficultyMarket.address, 1));
        assert.equal(parseInt((parseInt((b/(a+b))*(upperBoundaryDifficulty-lowerBoundaryDifficulty))+parseInt(lowerBoundaryDifficulty))),parseInt(currentDifficulty*1.05));
        console.log("starting Difficulty is :"+currentDifficulty+" and the price of normal market is at "+(parseInt((b/(a+b))*(upperBoundaryDifficulty-lowerBoundaryDifficulty))+parseInt(lowerBoundaryDifficulty))+"where as it should be around"+currentDifficulty*1.05);
        console.log("frist difficultyMarket created");

        // Creation of second  difficultyPlusFivePercent market
        conditionalTokensforMarketBAddress=(await higherMarketPriceEvent.outcomeTokens(1));
	      difficultyPlusFivePercentOracle=await DifficultyPlusFivePercentOracle.new(targetBlock);
        difficultyPlusFivePercentEvent=await ScalarEvent.new(conditionalTokensforMarketBAddress,difficultyPlusFivePercentOracle.address,lowerBoundaryDifficulty,upperBoundaryDifficulty);

        difficultyPlusFivePercentMarket=utils.getParamFromTxEvent(
        await standardMarketWithPriceLoggerFactory.createMarket(difficultyPlusFivePercentEvent.address, lmsrMarketMaker.address, fee, startDate,{from:accounts[0]}),
        'market',StandardMarketWithPriceLogger
         );
        await OutcomeToken.at(conditionalTokensforMarketBAddress).approve(difficultyPlusFivePercentMarket.address,lsmrFunding);
        await difficultyPlusFivePercentMarket.fund(lsmrFunding);
        assert.equal(await difficultyPlusFivePercentMarket.funding(),lsmrFunding);
        //1 / (1+exp(q/b))difficulty*0.22+difficulty*0.98=difficulty+difficulty*0.05
        //1 / (1+sum(exp(q/b))=0.07/0.22
        //b=lsmrFunding /ln(2)
        //q=0.182322 b
        await buyInFutrachyMarket(difficultyPlusFivePercentMarket, lmsrMarketMaker,1,Math.floor(0.182322/Math.log(2)*lsmrFunding), 0, etherToken, higherMarketPriceEvent, 1,accounts) ;
        a=parseInt(await lmsrMarketMaker.calcMarginalPrice(difficultyPlusFivePercentMarket.address, 0));
        b=parseInt(await lmsrMarketMaker.calcMarginalPrice(difficultyPlusFivePercentMarket.address, 1));
        assert.equal(parseInt(b*(upperBoundaryDifficulty-lowerBoundaryDifficulty)/(a+b))+parseInt(currentDifficulty*0.98),parseInt(currentDifficulty*1.1));
        console.log("starting Difficulty is :"+currentDifficulty+" and the price of normal market is at "+(parseInt((b/(a+b))*(upperBoundaryDifficulty-lowerBoundaryDifficulty))+parseInt(currentDifficulty*0.98))+"where as it should be around"+currentDifficulty*1.1);
        console.log("Second market created");


        //Completion of first Categorical Event Oracle
        // order of inputaddresses is very very important!
        await avgPriceOracleForCategoricalEvent.setInputAddress(normalDifficultyMarket.address,difficultyPlusFivePercentMarket.address);


        //Creation of market rewards.
        avgPriceOracle= await PriceFromContractsOracle.new(targetBlock);
        await avgPriceOracle.setInputAddress(normalDifficultyMarket.address,difficultyPlusFivePercentMarket.address);
        boundary=(upperBoundaryDifficulty-lowerBoundaryDifficulty)/10;
        bribaryEvent=await ScalarEvent.new(etherToken.address,avgPriceOracle.address,-boundary,boundary);

        await etherToken.deposit({from: accounts[0],value: manipulatorReward});
        await etherToken.approve(bribaryEvent.address,manipulatorReward);
        await bribaryEvent.buyAllOutcomes(manipulatorReward);
        bribeToken=Token.at(await bribaryEvent.outcomeTokens(0));
        console.log("Bribe installed ");

         //Selling of manipulatorReward
         dutchAuction= await DutchExchange.new(1,10,bribeToken.address,etherToken.address,0x0); //starting the auction with 20 Ether
         await bribeToken.approve(dutchAuction.address,manipulatorReward);
         await dutchAuction.postSellOrder(manipulatorReward);
         assert.equal(await dutchAuction.sellVolumeCurrent(), manipulatorReward);

    })

        it('should test difficulty oracle setup: too early resolving', async () => {
            // Creation of first difficulty market
            assert.equal(await difficultyOracle.isOutcomeSet(), false)
            assert.equal(await difficultyPlusFivePercentOracle.isOutcomeSet(), false)

        })

        it('should test difficulty oracle setup: oracle input after two weeks', async () => {
                // Create difficulty oracle

                // TODO: TestRPC difficulty is 0, so these tests won't pass there
                await waitUntilBlock(0,targetBlock);
                  randomNr=Math.floor(Math.random()*1000)%100;
                 await difficultyOracle.setOutcome((currentDifficulty+randomNr));
                 await difficultyPlusFivePercentOracle.setOutcome(currentDifficulty+randomNr);

                 assert.equal(await difficultyOracle.isOutcomeSet(), true);
                 assert.equal(await difficultyOracle.getOutcome(), (currentDifficulty+randomNr) );

                 assert.equal(await difficultyPlusFivePercentOracle.isOutcomeSet(), true);
                 assert.equal(await difficultyPlusFivePercentOracle.getOutcome(), Math.floor((currentDifficulty+randomNr)*105/100) );
          })

    it('should test futarchy oracle with successful manipulation', async () => {
        // Create Oracles
        // Buy into market for outcome token 1
        const buyer = 3
        const manipulator=2;
        const manipulator2=6;
        const outcome = 1
        const short=0
        const long=1

        //Buying RewardTokens by manipulator
        await etherToken.deposit({value:parseInt(manipulatorReward/3)});
        await etherToken.approve(dutchAuction.address,parseInt(manipulatorReward/3));
        console.log(await dutchAuction.getPrice(1));
        await waitUntilBlock(18000+36000*3,1);
        console.log(await dutchAuction.getPrice(1));
        await dutchAuction.postBuyOrder(parseInt(manipulatorReward/3), 1);
        console.log("manipulator bought Reward tokens");
        //Trades
        //

       // Sell in Market DifficultyPlusfivePercentOracle by manipulator=2
       tokenCountManipulator1Short = 4*ETHER;
       await buyInFutrachyMarket(difficultyPlusFivePercentMarket, lmsrMarketMaker,short,tokenCountManipulator1Short , manipulator, etherToken, higherMarketPriceEvent, 1,accounts) ;
       assert.equal(await OutcomeToken.at(await difficultyPlusFivePercentEvent.outcomeTokens(0)).balanceOf(accounts[manipulator]),tokenCountManipulator1Short);

        // Buy in Market DifficultyMarket
        tokenCountManipulator1Long = 4*ETHER;
        await buyInFutrachyMarket(normalDifficultyMarket, lmsrMarketMaker,long,tokenCountManipulator1Long, manipulator, etherToken, higherMarketPriceEvent, 0,accounts) ;
        assert.equal(await OutcomeToken.at(await normalDifficultyEvent.outcomeTokens(1)).balanceOf(accounts[manipulator]),tokenCountManipulator1Long);
        console.log("manipulator traded");

        //waiting some time for price integral
        await waitUntilBlock(18000+36000*3,1);

        // Buy in Market DifficultyPlusfivePercentOracle by honest buyer=1
        tokenCountHonestBetter1Long = 1*ETHER;
        await buyInFutrachyMarket(difficultyPlusFivePercentMarket, lmsrMarketMaker,long,tokenCountHonestBetter1Long, buyer, etherToken, higherMarketPriceEvent, 1,accounts) ;
        assert.equal(await OutcomeToken.at(await difficultyPlusFivePercentEvent.outcomeTokens(1)).balanceOf(accounts[buyer]),tokenCountHonestBetter1Long);

        // Sell in Market DifficultyMarket
        tokenCountHonestBetter1Short=1*ETHER;
        await buyInFutrachyMarket(normalDifficultyMarket, lmsrMarketMaker,short,tokenCountHonestBetter1Short, buyer, etherToken, higherMarketPriceEvent, 0,accounts) ;
        assert.equal(await OutcomeToken.at(await normalDifficultyEvent.outcomeTokens(0)).balanceOf(accounts[buyer]),tokenCountHonestBetter1Short);
        console.log("honest trader traded");


        // Sell in Market DifficultyPlusfivePercentOracle by manipulator=2
        tokenCountManipulator2Short = 3*ETHER;
        market=difficultyPlusFivePercentMarket;
        await buyInFutrachyMarket(difficultyPlusFivePercentMarket, lmsrMarketMaker,short,tokenCountManipulator2Short , manipulator2, etherToken, higherMarketPriceEvent, 1,accounts) ;
        assert.equal(await OutcomeToken.at(await difficultyPlusFivePercentEvent.outcomeTokens(0)).balanceOf(accounts[manipulator2]),tokenCountManipulator2Short);

        // Buy in Market DifficultyMarket
        tokenCountManipulator2Long = 2*ETHER;
        await buyInFutrachyMarket(normalDifficultyMarket, lmsrMarketMaker,long,tokenCountManipulator2Long, manipulator2, etherToken, higherMarketPriceEvent, 0,accounts) ;
        assert.equal(await OutcomeToken.at(await normalDifficultyEvent.outcomeTokens(1)).balanceOf(accounts[manipulator2]),tokenCountManipulator2Long);
        console.log("manipulator2 traded");

        // Processing all closing of markets
        await waitUntilBlock(0,targetBlockEndMarkets);
        await normalDifficultyMarket.close()
        await difficultyPlusFivePercentMarket.close()


        // Processing all oracle outcome information
        await waitUntilBlock(0,targetBlock);

        randomNr=Math.floor(Math.random()*1000)%Math.floor(currentDifficulty/10);
        await difficultyOracle.setOutcome((currentDifficulty+randomNr));
        await difficultyPlusFivePercentOracle.setOutcome(currentDifficulty+randomNr);
        await avgPriceOracleForCategoricalEvent.setOutcome();
        await avgPriceOracle.setOutcome();

        await higherMarketPriceEvent.setOutcome()
        await normalDifficultyEvent.setOutcome()
        await difficultyPlusFivePercentEvent.setOutcome()
        await bribaryEvent.setOutcome();

        console.log("normal difficulty market gives:" + (await normalDifficultyMarket.getAvgPrice.call()).valueOf())
        console.log(" difficultyPlusFivePercent market gives:" + (await difficultyPlusFivePercentMarket.getAvgPrice.call()).valueOf())
        assert.equal(await avgPriceOracleForCategoricalEvent.getOutcome(),0)
        console.log("markets successfully manipulated");

        // Withdrawing all funds

        await normalDifficultyEvent.redeemWinnings({from:accounts[buyer]});
        await difficultyPlusFivePercentEvent.redeemWinnings({from:accounts[buyer]});
        await higherMarketPriceEvent.redeemWinnings({from:accounts[buyer]});
        console.log(await etherToken.balanceOf(accounts[buyer]));
        //assert.equal(await etherToken.balanceOf(accounts[buyer]),to be calculated )
        console.log("honest better reveals its tokens balance");

        await normalDifficultyEvent.redeemWinnings({from:accounts[manipulator]});
        await difficultyPlusFivePercentEvent.redeemWinnings({from:accounts[manipulator]});
        await higherMarketPriceEvent.redeemWinnings({from:accounts[manipulator]});
        //assert.equal(await etherToken.balanceOf(accounts[manipulator]), to be calculated )
        console.log("manipulator reveals its tokens balance");
        console.log(await etherToken.balanceOf(accounts[manipulator]));
  })
  it('should test futarchy oracle non-manipulated', async () => {
      // Create Oracles
      // Buy into market for outcome token 1
      // Create Oracles
      // Buy into market for outcome token 1
      const buyer = 3
      const manipulator=2;
      const manipulator2=6;
      const outcome = 1
      const short=0
      const long=1

      //Buying RewardTokens by manipulator
      await etherToken.deposit({value:parseInt(manipulatorReward/3)});
      await etherToken.approve(dutchAuction.address,parseInt(manipulatorReward/3));
      console.log(await dutchAuction.getPrice(1));
      await waitUntilBlock(18000+36000*3,1);
      console.log(await dutchAuction.getPrice(1));
      await dutchAuction.postBuyOrder(parseInt(manipulatorReward/3), 1);
      console.log("manipulator bought Reward tokens");
      //Trades
      //



      // Sell in Market DifficultyPlusfivePercentOracle by manipulator=2
      tokenCountManipulator1Short = 1*ETHER;
      await buyInFutrachyMarket(difficultyPlusFivePercentMarket, lmsrMarketMaker,short,tokenCountManipulator1Short , manipulator, etherToken, higherMarketPriceEvent, 1,accounts) ;
      assert.equal(await OutcomeToken.at(await difficultyPlusFivePercentEvent.outcomeTokens(0)).balanceOf(accounts[manipulator]),tokenCountManipulator1Short);

      // Buy in Market DifficultyMarket
      tokenCountManipulator1Long = 1*ETHER;
      await buyInFutrachyMarket(normalDifficultyMarket, lmsrMarketMaker,long,tokenCountManipulator1Long, manipulator, etherToken, higherMarketPriceEvent, 0,accounts) ;
      assert.equal(await OutcomeToken.at(await normalDifficultyEvent.outcomeTokens(1)).balanceOf(accounts[manipulator]),tokenCountManipulator1Long);
      console.log("manipulator traded");

      //waiting some time for price integral
      await waitUntilBlock(18000+36000*3,1);

      // Buy in Market DifficultyPlusfivePercentOracle by honest buyer=1
      tokenCountHonestBetter1Long = 4*ETHER;
      await buyInFutrachyMarket(difficultyPlusFivePercentMarket, lmsrMarketMaker,long,tokenCountHonestBetter1Long, buyer, etherToken, higherMarketPriceEvent, 1,accounts) ;
      assert.equal(await OutcomeToken.at(await difficultyPlusFivePercentEvent.outcomeTokens(1)).balanceOf(accounts[buyer]),tokenCountHonestBetter1Long);

      // Sell in Market DifficultyMarket
      tokenCountHonestBetter1Short=4*ETHER;
      await buyInFutrachyMarket(normalDifficultyMarket, lmsrMarketMaker,short,tokenCountHonestBetter1Short, buyer, etherToken, higherMarketPriceEvent, 0,accounts) ;
      assert.equal(await OutcomeToken.at(await normalDifficultyEvent.outcomeTokens(0)).balanceOf(accounts[buyer]),tokenCountHonestBetter1Short);
      console.log("honest trader traded");


      //waiting some time for price integral
      await waitUntilBlock(18000+36000*3,1);

      // Sell in Market DifficultyPlusfivePercentOracle by manipulator=2
      tokenCountManipulator2Short = 3*ETHER;
      market=difficultyPlusFivePercentMarket;
      await buyInFutrachyMarket(difficultyPlusFivePercentMarket, lmsrMarketMaker,short,tokenCountManipulator2Short , manipulator2, etherToken, higherMarketPriceEvent, 1,accounts) ;
      assert.equal(await OutcomeToken.at(await difficultyPlusFivePercentEvent.outcomeTokens(0)).balanceOf(accounts[manipulator2]),tokenCountManipulator2Short);

      // Buy in Market DifficultyMarket
      tokenCountManipulator2Long = 2*ETHER;
      await buyInFutrachyMarket(normalDifficultyMarket, lmsrMarketMaker,long,tokenCountManipulator2Long, manipulator2, etherToken, higherMarketPriceEvent, 0,accounts) ;
      assert.equal(await OutcomeToken.at(await normalDifficultyEvent.outcomeTokens(1)).balanceOf(accounts[manipulator2]),tokenCountManipulator2Long);
      console.log("manipulator2 traded");

      // Processing all closing of markets
      await waitUntilBlock(0,targetBlockEndMarkets);
      await normalDifficultyMarket.close()
      await difficultyPlusFivePercentMarket.close()


      // Processing all oracle outcome information
      await waitUntilBlock(0,targetBlock);

      randomNr=Math.floor(Math.random()*1000)%Math.floor(currentDifficulty/10);
      await difficultyOracle.setOutcome((currentDifficulty+randomNr));
      await difficultyPlusFivePercentOracle.setOutcome(currentDifficulty+randomNr);
      await avgPriceOracleForCategoricalEvent.setOutcome();
      await avgPriceOracle.setOutcome();

      await higherMarketPriceEvent.setOutcome()
      await normalDifficultyEvent.setOutcome()
      await difficultyPlusFivePercentEvent.setOutcome()
      await bribaryEvent.setOutcome();

      console.log("normal difficulty market gives:" + (await normalDifficultyMarket.getAvgPrice.call()).valueOf())
      console.log(" difficultyPlusFivePercent market gives:" + (await difficultyPlusFivePercentMarket.getAvgPrice.call()).valueOf())
      assert.equal(await avgPriceOracleForCategoricalEvent.getOutcome(),1)
      console.log("markets successfully not manipulated");

      // Withdrawing all funds

      await normalDifficultyEvent.redeemWinnings({from:accounts[buyer]});
      await difficultyPlusFivePercentEvent.redeemWinnings({from:accounts[buyer]});
      await higherMarketPriceEvent.redeemWinnings({from:accounts[buyer]});
      console.log(await etherToken.balanceOf(accounts[buyer]));
      //assert.equal(await etherToken.balanceOf(accounts[buyer]),to be calculated )
      console.log("honest better reveals its tokens balance");

      await normalDifficultyEvent.redeemWinnings({from:accounts[manipulator]});
      await difficultyPlusFivePercentEvent.redeemWinnings({from:accounts[manipulator]});
      await higherMarketPriceEvent.redeemWinnings({from:accounts[manipulator]});
      //assert.equal(await etherToken.balanceOf(accounts[manipulator]), to be calculated )
      console.log("manipulator reveals its tokens balance");
      console.log(await etherToken.balanceOf(accounts[manipulator]));
    })
  })
const buyInFutrachyMarket = async function (market, marketMaker,long, tokenCount, initiator, collateral, higherMarketPriceEvent, futarchyMarketCount,accounts) {

  outcomeTokenCost = await marketMaker.calcCost(market.address, long, tokenCount)
  marketfee = await market.calcMarketFee(outcomeTokenCost)
  cost = marketfee.add(outcomeTokenCost)

  //first we need to hedge in the HigherMarketPriceEvent
  await collateral.deposit({ value: cost, from: accounts[initiator] })
  //assert.equal(await collateral.balanceOf(accounts[initiator]), cost.valueOf())
  await collateral.approve(higherMarketPriceEvent.address,cost,{from:accounts[initiator]});
  await higherMarketPriceEvent.buyAllOutcomes(cost,{from:accounts[initiator]});

  //Now we can particiapte in the Market
  await OutcomeToken.at(await higherMarketPriceEvent.outcomeTokens(futarchyMarketCount)).approve(market.address, cost, { from: accounts[initiator] })
  await market.buy(long, tokenCount,cost, {from: accounts[initiator]})

}
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
