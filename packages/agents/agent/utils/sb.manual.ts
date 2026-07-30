import { E2BSandbox } from './sandbox'

console.log("E2B:", process.env.E2B_API_KEY);
console.log({
  account: process.env.R2_ACCOUNT_ID,
  endpoint: process.env.R2_ENDPOINT,
  bucket: process.env.R2_BUCKET_NAME,
  access: process.env.R2_ACCESS_KEY_ID,
  secret: process.env.R2_SECRET_ACCESS_KEY?.slice(0, 5) + "...",
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