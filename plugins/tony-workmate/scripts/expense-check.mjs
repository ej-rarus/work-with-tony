import fs from 'node:fs';
import { checkExpenses } from './expenses.mjs';

const args = process.argv.slice(2);
if (args.length !== 1) {
  console.error('Usage: node expense-check.mjs <input.json|->');
  process.exitCode = 1;
} else {
  try {
    const raw = fs.readFileSync(args[0] === '-' ? 0 : args[0], 'utf8');
    const result = checkExpenses(JSON.parse(raw));
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.status === 'ready' ? 0 : 2;
  } catch (error) {
    console.error(JSON.stringify({ status: 'invalid_input', error: error.message }));
    process.exitCode = 1;
  }
}
