let Math = artifacts.require('@gnosis.pm/gnosis-core-contracts/contracts/Utils/Math')

let DifficultyOracleFactory = artifacts.require('DifficultyOracleFactory')
let StandardMarketFactory = artifacts.require('@gnosis.pm/gnosis-core-contracts/contracts/MarketMakers/StandardMarketFactory')
let StandardMarketWithPriceLoggerFactory = artifacts.require('@gnosis.pm/gnosis-core-contracts/contracts/Markets/StandardMarketWithPriceLoggerFactory')
let CategoricalEvent=artifacts.require('CategoricalEvent')
let ScalarEvent=artifacts.require('ScalarEvent')
let LMSRMarketMaker = artifacts.require('LMSRMarketMaker')
let EventFactory = artifacts.require('@gnosis.pm/gnosis-core-contracts/contracts/Events/EventFactory')
let EtherToken = artifacts.require('@gnosis.pm/gnosis-core-contracts/contracts/Tokens/EtherToken')
module.exports = function (deployer) {
    deployer.deploy(Math)
    deployer.link(Math, [  StandardMarketFactory,LMSRMarketMaker, ScalarEvent, CategoricalEvent])

    deployer.deploy(DifficultyOracleFactory);

    deployer.link(Math, StandardMarketFactory)
    deployer.deploy(StandardMarketFactory)

    deployer.link(Math, EtherToken)
    deployer.deploy(EtherToken)


    deployer.link(Math, StandardMarketWithPriceLoggerFactory)
    deployer.deploy(StandardMarketWithPriceLoggerFactory)
}
