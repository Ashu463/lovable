import { E2BSandbox } from './sandbox'

// Presence only — never print credential values, even truncated.
console.log({
  e2bKey: Boolean(process.env.E2B_API_KEY),
  r2Account: Boolean(process.env.R2_ACCOUNT_ID),
  r2Endpoint: Boolean(process.env.R2_ENDPOINT),
  r2Bucket: Boolean(process.env.R2_BUCKET_NAME),
  r2AccessKey: Boolean(process.env.R2_ACCESS_KEY_ID),
  r2SecretKey: Boolean(process.env.R2_SECRET_ACCESS_KEY),
});
const sanbox: E2BSandbox = await E2BSandbox.StartSandbox("ashu2", "p1")
// console.log(await sanbox.Execute(sanbox.sandboxId, {action: 'runCommand', command: "cd /home/user && find . -type f -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/dist/*' -not -path '*/build/*' 2>/dev/null | sort"}))
// console.log(await sanbox.Execute(sanbox.sandboxId, {action: 'runCommand', command: "which tree"}))
console.log(await sanbox.Execute(sanbox.sandboxId, {action: 'runCommand', command: "ls -la /home/user"}), " ls -la ka result")
const command = "find . -type f      -not -path '*/node_modules/*'      -not -path '*/.git/*'      -not -path '*/dist/*'      -not -path '*/build/*' -not -path '*/.npm/*'      -not -name '.env'"
console.log(await sanbox.Execute(sanbox.sandboxId, {action: 'runCommand', command: command}), " if changing directory to app/")

// ------------This thing was actually working---------------
// const result = await this.sandbox.commands.run(
//             "find . -type f -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/dist/*' -not -path '*/build/*' -not -name '.env'",
//             { cwd: '/home/user/app' }
//         )
//         console.log(result.stdout, " during bootstrap")