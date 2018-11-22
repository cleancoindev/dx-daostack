
/* global artifacts, web3, contract, it, before, beforeEach, after, afterEach, assert, expect, should */

const MgnToken = artifacts.require('TokenFRT')
const DxLockMgnForRep = artifacts.require('DxLockMgnForRep')
const DxReputation = artifacts.require('DxReputation')
const BN = require('bn.js')

const {
  increaseTimeAndMine,
  takeSnapshot,
  revertSnapshot,
  getTimestamp
} = require('../src/helpers/web3helpers')(web3)

contract('Locking MGN for REP', accounts => {
  let MGN, DxLock4Rep, DxRep
  let master
  let snapshotId

  before(async () => {
    snapshotId = await takeSnapshot();
    [master] = accounts
    MGN = await MgnToken.deployed()
    DxLock4Rep = await DxLockMgnForRep.deployed()
    DxRep = await DxReputation.deployed()
  })

  afterEach(() => {
    console.log('--------------------')
  })

  after(() => revertSnapshot(snapshotId))

  it('can\'t lock through the scheme initially', async () => {
    const lockedMGN = await MGN.lockedTokenBalances.call(master)
    console.log('locked MGN: ', lockedMGN.toString())
    assert(lockedMGN.eq(new BN(0)), 'shouldn\t have any MGN locked initially')
    try {
      await DxLock4Rep.lock({ from: master })
      // should be unreachable
      assert.fail('shouldn\'t lock when no MGN locked')
    } catch (error) {
      assert.include(error.message, 'locking amount should be > 0', 'error message should contain string specified')
    }
  })

  it('can lock MGN tokens', async () => {
    const balance = await MGN.balanceOf(master)
    console.log('MGN balance: ', balance.toString())
    assert(balance.gt(0), 'balance should not be 0')

    const lockedTokensBefore = await MGN.lockedTokenBalances.call(master)
    console.log('lockedTokensBefore: ', lockedTokensBefore.toString())

    const lockAmount = 20

    await MGN.lockTokens(lockAmount)

    const lockedTokensAfter = await MGN.lockedTokenBalances.call(master)
    console.log('lockedTokensAfter: ', lockedTokensAfter.toString())

    const diff = lockedTokensAfter.sub(lockedTokensBefore)

    assert(diff.eq(new BN(lockAmount)), 'the exact amount should be locked')
  })

  it('can\'t lock through the scheme before lockingStartTime', async () => {
    const lockedMGN = await MGN.lockedTokenBalances.call(master)
    console.log('locked MGN: ', lockedMGN.toString())
    assert(lockedMGN.gt(new BN(0)), 'should have some MGN locked')

    const lockingStartTime = await DxLock4Rep.lockingStartTime()
    console.log('lockingStartTime: ', lockingStartTime.toString())
    const now = await getTimestamp()

    assert(lockingStartTime.gt(new BN(now)), 'lockingStartTime should be in the future')

    try {
      await DxLock4Rep.lock({ from: master })
      // should be unreachable
      assert.fail('shouldn\'t lock before lockingStartTime')
    } catch (error) {
      assert.include(error.message, 'lock should start after lockingStartTime', 'error message should contain string specified')
    }
  })

  it('can lock through the scheme after all', async () => {
    const lockedMGN = await MGN.lockedTokenBalances.call(master)
    console.log('locked MGN: ', lockedMGN.toString())
    assert(lockedMGN.gt(new BN(0)), 'should have some MGN locked')

    const lockingStartTime = await DxLock4Rep.lockingStartTime()
    console.log('lockingStartTime: ', lockingStartTime.toString())
    const timestamp1 = await getTimestamp()
    console.log('now: ', timestamp1)

    const advanceBy = lockingStartTime.sub(new BN(timestamp1 - 1000))
    console.log('advanceBy: ', advanceBy.toString())
    await increaseTimeAndMine(advanceBy.toNumber())

    const timestamp2 = await getTimestamp()
    console.log('now: ', timestamp2)

    assert(lockingStartTime.lt(new BN(timestamp2)), 'lockingStartTime should be in the past')

    await DxLock4Rep.lock({ from: master })

    const score = await DxLock4Rep.scores(master)
    assert(score.eq(lockedMGN), 'score should be equal to locked MGN')
  })

  it('can\'t lock twice', async () => {
    try {
      await DxLock4Rep.lock({ from: master })
      // should be unreachable
      assert.fail('shouldn\'t lock twice for one same account')
    } catch (error) {
      assert.include(error.message, 'locking twice is not allowed', 'error message should contain string specified')
    }
  })

  it('can\'t redeem before redeemEnableTime', async () => {
    const redeemEnableTime = await DxLock4Rep.redeemEnableTime()
    const now = await getTimestamp()

    assert(redeemEnableTime.gt(new BN(now)), 'redeemEnableTime should be in the future')

    try {
      await DxLock4Rep.redeem(master)
      // should be unreachable
      assert.fail('shouldn\'t redeem before redeemEnableTime')
    } catch (error) {
      assert.include(error.message, 'now > redeemEnableTime', 'error message should contain string specified')
    }
  })

  it('can redeem after redeemEnableTime', async () => {
    const redeemEnableTime = await DxLock4Rep.redeemEnableTime()
    console.log('redeemEnableTime: ', redeemEnableTime.toString())
    const timestamp1 = await getTimestamp()
    console.log('now: ', timestamp1)

    const advanceBy = redeemEnableTime.sub(new BN(timestamp1 - 1000))
    console.log('advanceBy: ', advanceBy.toString())
    await increaseTimeAndMine(advanceBy.toNumber())

    const timestamp2 = await getTimestamp()
    console.log('now: ', timestamp2)

    assert(redeemEnableTime.lt(new BN(timestamp2)), 'redeemEnableTime should be in the past')

    const scoreBefore = await DxLock4Rep.scores(master)
    console.log('scoreBefore: ', scoreBefore.toString())
    assert(scoreBefore.gt(new BN(0)), 'score before should be > 0')

    const totalScore = await DxLock4Rep.totalScore()

    const reputationReward = await DxLock4Rep.reputationReward()
    const expectedREP = scoreBefore.mul(reputationReward).div(totalScore)

    const repBefore = await DxRep.balanceOf(master)
    console.log('rep Before: ', repBefore.toString())
    assert(repBefore.eq(new BN(0)), 'should not have REP at first')

    await DxLock4Rep.redeem(master)

    const scoreAfter = await DxLock4Rep.scores(master)
    console.log('score After: ', scoreAfter.toString())
    assert(scoreAfter.eq(new BN(0)), 'score after should be 0')

    const repAfter = await DxRep.balanceOf(master)
    console.log('rep After: ', repAfter.toString())
    assert(repAfter.eq(expectedREP), 'the only account should have gotten REP proportional to its score')
  })

  it('can\'t redeem twice', async () => {
    const score = await DxLock4Rep.scores(master)
    assert(score.eq(new BN(0)), 'score should be 0 after redeeming')

    try {
      await DxLock4Rep.redeem(master)
      // should be unreachable
      assert.fail('shouldn\'t with score == 0')
    } catch (error) {
      assert.include(error.message, 'score should be > 0', 'error message should contain string specified')
    }
  })
})
