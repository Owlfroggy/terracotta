import { parseArgs } from "@std/cli/parse-args";

/**
 * Release script to automate version bumping, tagging, and pushing.
 * Usage: deno task release [--version <new_version>]
 */

async function main() {
  const args = parseArgs(Deno.args, {
    string: ["version"],
    alias: { v: "version" },
  });

  // 1. Read current version from package.json
  let packageJsonText: string;
  try {
    packageJsonText = await Deno.readTextFile("package.json");
  } catch (e) {
    console.error("Could not read package.json:", e);
    Deno.exit(1);
  }

  const packageJson = JSON.parse(packageJsonText);
  const currentVersion = packageJson.version;

  let nextVersion = args.version;

  if (!nextVersion) {
    console.log(`Current version: ${currentVersion}`);
    const input = prompt("Enter next version (e.g. 0.4.1):");
    if (!input) {
      console.log("No version provided. Exiting.");
      return;
    }
    nextVersion = input;
  }

  // Strip 'v' prefix if user included it for the version number in files
  if (nextVersion.startsWith("v")) {
    nextVersion = nextVersion.substring(1);
  }

  console.log(`Bumping version to ${nextVersion}...`);

  // 2. Update package.json
  packageJson.version = nextVersion;
  await Deno.writeTextFile("package.json", JSON.stringify(packageJson, null, 2) + "\n");
  console.log("Updated package.json");

  // 3. Update src/main.ts
  try {
    const mainTsText = await Deno.readTextFile("src/main.ts");
    const updatedMainTsText = mainTsText.replace(
      /export const VERSION = ".*"/,
      `export const VERSION = "${nextVersion}"`
    );
    await Deno.writeTextFile("src/main.ts", updatedMainTsText);
    console.log("Updated src/main.ts");
  } catch (e) {
    console.warn("Could not update src/main.ts:", e.message);
  }

  // 4. Git operations
  const tag = `v${nextVersion}`;

  console.log("Committing changes...");
  try {
    const addCmd = new Deno.Command("git", { args: ["add", "package.json", "src/main.ts"] });
    await addCmd.output();

    const commitCmd = new Deno.Command("git", { args: ["commit", "-m", `Release ${tag}`] });
    await commitCmd.output();

    console.log(`Creating tag ${tag}...`);
    const tagCmd = new Deno.Command("git", { args: ["tag", tag] });
    await tagCmd.output();
  } catch (e) {
    console.error("Git operations failed:", e);
    Deno.exit(1);
  }

  const push = confirm(`Do you want to push 'main' and tag '${tag}' to origin?`);
  if (push) {
    console.log("Pushing...");
    const pushCmd = new Deno.Command("git", { args: ["push", "origin", "main", "--tags"] });
    const { success, stderr } = await pushCmd.output();
    if (success) {
      console.log("Successfully pushed to origin.");
    } else {
      console.error("Failed to push to origin:");
      console.error(new TextDecoder().decode(stderr));
    }
  } else {
    console.log("Skipped pushing. You can push manually with 'git push origin main --tags'");
  }

  console.log("Release process complete!");
}

if (import.meta.main) {
  main();
}
