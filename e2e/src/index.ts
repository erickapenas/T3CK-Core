import { config } from './config';
import { SmokeTestSuite } from './smoke-test';

async function runE2ETests() {
  console.log('🚀 Starting E2E Test Suite');
  console.log(`Environment: ${config.environment}`);
  console.log(`Base URL: ${config.baseUrl}\n`);

  const suite = new SmokeTestSuite({
    baseUrl: config.baseUrl,
    timeout: config.timeout,
    environment: config.environment as 'staging' | 'production',
  });

  try {
    await suite.runAll();
    suite.printReport();

    const summary = suite.getSummary();

    // Exit with appropriate code
    if (summary.failed > 0) {
      console.error(`\n❌ E2E tests failed: ${summary.failed} failures out of ${summary.total}`);
      process.exit(1);
    }

    console.log(`\n✅ E2E tests passed: All ${summary.total} tests successful`);
    process.exit(0);
  } catch (error) {
    console.error('\n💥 Fatal error during E2E tests:');
    console.error(error);
    process.exit(1);
  }
}

runE2ETests();
