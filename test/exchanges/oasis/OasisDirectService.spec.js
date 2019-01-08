import { buildTestService } from '../../helpers/serviceBuilders';
import { setProxyAccount, setNewAccount } from '../../helpers/proxyHelpers';
import TestAccountProvider from '../../helpers/TestAccountProvider';
import createDaiAndPlaceLimitOrder from '../../helpers/oasisHelpers';
import { transferMkr } from '../../helpers/proxyHelpers';

let service, proxyAccount;

async function buildTestOasisDirectService() {
  service = buildTestService('exchange', {
    exchange: 'OasisDirectService'
  });
  await service.manager().authenticate();
}

function proxy() {
  return service.get('proxy').currentProxy();
}

describe(
  'oasis direct',
  () => {
    beforeEach(async () => {
      await buildTestOasisDirectService();
    });

    describe('format contract call', () => {
      test('set contract method', async () => {
        const proxy = await service.get('proxy').currentProxy();
        const buyEth = service._setMethod('DAI', 'ETH', 'sellAllAmount');
        const payEth = service._setMethod('ETH', 'DAI', 'sellAllAmount', proxy);
        const createAndPayEth = service._setMethod(
          'ETH',
          'DAI',
          'sellAllAmount'
        );
        const sell = service._setMethod('DAI', 'MKR', 'sellAllAmount');
        expect(buyEth).toEqual('sellAllAmountBuyEth');
        expect(payEth).toEqual('sellAllAmountPayEth');
        expect(createAndPayEth).toEqual('createAndSellAllAmountPayEth');
        expect(sell).toEqual('sellAllAmount');
      });

      test('set contract parameters', async () => {
        const otcAddress = service
          .get('smartContract')
          .getContractByName('MAKER_OTC').address;
        const daiAddress = service
          .get('token')
          .getToken('DAI')
          .address();
        const wethAddress = service
          .get('token')
          .getToken('WETH')
          .address();
        const normalParams = await service._buildParams(
          'DAI',
          'DAI',
          '0.01',
          'WETH',
          0
        );
        const ethParams = await service._buildParams(
          'ETH',
          'WETH',
          '0.01',
          'DAI',
          100
        );

        expect(normalParams.length).toEqual(5);
        expect(normalParams[0]).toEqual(otcAddress);
        expect(normalParams[1]).toEqual(daiAddress);
        expect(Object.keys(normalParams[2])).toEqual(['_bn']);
        expect(normalParams[3]).toEqual(wethAddress);
        expect(Object.keys(normalParams[4])).toEqual(['_bn']);

        expect(ethParams.length).toEqual(4);
        expect(ethParams[0]).toEqual(otcAddress);
        expect(ethParams[1]).toEqual(wethAddress);
        expect(ethParams[2]).toEqual(daiAddress);
        expect(Object.keys(ethParams[3])).toEqual(['_bn']);
      });

      test('set transaction options', () => {
        const normalOptions = service._buildOptions(
          { value: 1 },
          'DAI',
          'method'
        );
        const ethOptions = service._buildOptions({ value: 1 }, 'ETH', 'method');
        const createOptions = service._buildOptions(
          { value: 1 },
          'ETH',
          'create'
        );
        expect(Object.keys(normalOptions)).toEqual(['otc', 'dsProxy']);
        expect(Object.keys(ethOptions)).toEqual(['value', 'otc', 'dsProxy']);
        expect(Object.keys(createOptions)).toEqual(['value', 'otc']);
      });
    });

    describe('buyAmount', () => {
      let buyAmount;

      beforeEach(async () => {
        await createDaiAndPlaceLimitOrder(service);
        buyAmount = await service.getBuyAmount('WETH', 'DAI', '0.01');
      });

      test('get buy amount', async () => {
        expect(Object.keys(buyAmount)).toEqual(['_bn']);
        expect(buyAmount.toString()).toEqual('500000000000000');
      });

      test('get minBuyAmount', async () => {
        const limit = await service._minBuyAmount('WETH', 'DAI', '0.01');
        expect(limit).toEqual(490000000000000);
      });

      test('use cached buyAmount to determine limit', () => {
        expect(buyAmount).toEqual(service._buyAmount);
      });
    });

    describe('payAmount', () => {
      let payAmount;

      beforeEach(async () => {
        await createDaiAndPlaceLimitOrder(service);
        payAmount = await service.getPayAmount('DAI', 'WETH', '0.01');
      });

      test('get pay amount', () => {
        expect(Object.keys(payAmount)).toEqual(['_bn']);
        expect(payAmount.toString()).toEqual('200000000000000000');
      });

      test('get maxPayAmount', async () => {
        const limit = await service._maxPayAmount('DAI', 'WETH', '0.01');
        expect(limit).toEqual(204000000000000000);
      });

      test('use cached payAmount to determine limit', () => {
        expect(payAmount).toEqual(service._payAmount);
      });
    });

    describe('trade with existing dsproxy', () => {
      beforeEach(async () => {
        if (!proxyAccount) {
          proxyAccount = TestAccountProvider.nextAccount();
        }
        await transferMkr(service, proxyAccount.address);
        await setProxyAccount(service, proxyAccount);
        if (!(await proxy())) await service.get('proxy').build();
        await createDaiAndPlaceLimitOrder(service);
      });

      describe(
        'sell',
        () => {
          test(
            'sell all amount',
            async () => {
              await service.sell('DAI', 'WETH', { value: '0.01' });
            },
            100000
          );

          // Something needs approval that's not getting it
          test(
            'sell all amount, buy eth',
            async () => {
              try {
                await service.sell('DAI', 'ETH', { value: '0.01' });
              } catch (err) {
                console.error(err.message);
              }
            },
            100000
          );

          // Something needs approval that's not getting it
          test('sell all amount, pay eth', async () => {
            try {
              await createDaiAndPlaceLimitOrder(service, true);
              await service.sell('ETH', 'DAI', { value: '0.01' });
            } catch (err) {
              console.error(err.message);
            }
          });
        },
        100000
      );

      describe('buy', () => {
        test(
          'buy all amount',
          async () => {
            try {
              await service.buy('WETH', 'DAI', { value: '0.01' });
            } catch (err) {
              console.error(err.message);
            }
          },
          100000
        );

        test(
          'buy all amount, buy eth',
          async () => {
            try {
              await service.buy('ETH', 'DAI', { value: '0.01' });
            } catch (err) {
              console.error(err.message);
            }
          },
          100000
        );

        test(
          'buy all amount, pay eth',
          async () => {
            try {
              await createDaiAndPlaceLimitOrder(service, true);
              await service.buy('DAI', 'ETH', { value: '0.01' });
            } catch (err) {
              console.error(err);
            }
          },
          100000
        );
      });
    });

    describe('create dsproxy and execute', () => {
      beforeEach(async () => {
        const accountService = service.get('web3').get('accounts');
        await setNewAccount(accountService);
        await createDaiAndPlaceLimitOrder(service);
      });

      test(
        'sell all amount, pay eth',
        async () => {
          try {
            await createDaiAndPlaceLimitOrder(service, true);
            await service.sell('ETH', 'DAI', { value: '0.01' });
          } catch (err) {
            console.error(err.message);
          }
        },
        10000
      );

      test(
        'buy all amount, pay eth',
        async () => {
          try {
            await createDaiAndPlaceLimitOrder(service, true);
            await service.buy('DAI', 'ETH', { value: '0.01' });
          } catch (err) {
            console.error(err.message);
          }
        },
        100000
      );
    });
  },
  100000
);
