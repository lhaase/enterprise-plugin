'use strict';

const stripAnsi = require('strip-ansi');
const setup = require('./setup');

let sls1;
let sls2;
let teardown;

describe('integration: outputs', function() {
  this.timeout(1000 * 60 * 5);

  beforeAll(
    async () =>
      ([{ sls: sls1, teardown }, { sls: sls2 }] = await Promise.all([
        setup('service'),
        setup('service2'),
      ]))
  );

  afterAll(() => {
    if (teardown) return teardown();
    return null;
  });

  it('can publish and consume outputs', async () => {
    await sls1(['deploy']);

    const printStdout = stripAnsi(
      String((await sls2(['print', '--path', 'custom.testOutput'])).stdoutBuffer)
    );
    expect(printStdout).to.include('outputValue\n\n');
  });
});
