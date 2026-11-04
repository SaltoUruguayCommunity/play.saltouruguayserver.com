import 'dotenv/config';
import { cleanBuildError, processQueuedBuild, recoverInterruptedBuilds } from '../src/lib/build-process';
let stopping = false;
process.on('SIGTERM', () => { stopping = true; });
process.on('SIGINT', () => { stopping = true; });
const once = process.argv.includes('--once');
async function main() {
  do {
    await recoverInterruptedBuilds();
    const processed = await processQueuedBuild();
    if (once && !processed) break;
    if (!once && !processed && !stopping) await new Promise(resolve => setTimeout(resolve, 1500));
  } while (!stopping);
}
main().then(() => process.exit(0)).catch(error => { console.error('SaltoUruguayServer hosted worker:', cleanBuildError(error)); process.exit(1); });
