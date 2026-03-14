import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

const projectRoot = process.cwd();
const cursorRulesDir = path.join(projectRoot, '.cursor', 'rules');
const cursorSkillsDir = path.join(projectRoot, '.cursor', 'skills');
const claudeSkillsDir = path.join(projectRoot, '.claude', 'skills');
const docsDir = path.join(projectRoot, 'docs', 'ai');
const sharedRulesDir = path.join(docsDir, 'rules');
const sharedSkillsDir = path.join(docsDir, 'skills');
const manifestPath = path.join(docsDir, 'cursor-rule-manifest.json');

const mode = process.argv[2] ?? 'generate';

const normalizeNewlines = (value) => value.replace(/\r\n/g, '\n');

const stripQuotes = (value) => {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
};

const parseGlobs = (lines, startIndex, initialValue) => {
  const inlineValue = initialValue.trim();

  if (inlineValue === '[]') {
    return { globs: [], nextIndex: startIndex + 1 };
  }

  if (
    inlineValue.startsWith('[') &&
    inlineValue.endsWith(']') &&
    inlineValue !== '['
  ) {
    return {
      globs: JSON.parse(inlineValue.replace(/'/g, '"')),
      nextIndex: startIndex + 1,
    };
  }

  if (inlineValue === '[') {
    const globs = [];
    let currentIndex = startIndex + 1;

    while (currentIndex < lines.length) {
      const line = lines[currentIndex].trim();

      if (line === ']') {
        return { globs, nextIndex: currentIndex + 1 };
      }

      if (line !== '') {
        globs.push(stripQuotes(line.replace(/,$/, '').trim()));
      }

      currentIndex += 1;
    }
  }

  throw new Error(`Unable to parse globs definition starting on line ${startIndex + 1}`);
};

const parseFrontmatterBlock = (block) => {
  const metadata = {
    alwaysApply: false,
    description: '',
    globs: [],
  };
  const lines = normalizeNewlines(block).split('\n');

  for (let lineIndex = 0; lineIndex < lines.length; ) {
    const line = lines[lineIndex].trim();

    if (line === '') {
      lineIndex += 1;
      continue;
    }

    if (line.startsWith('description:')) {
      metadata.description = stripQuotes(
        line.slice('description:'.length).trim(),
      );
      lineIndex += 1;
      continue;
    }

    if (line.startsWith('alwaysApply:')) {
      metadata.alwaysApply =
        line.slice('alwaysApply:'.length).trim() === 'true';
      lineIndex += 1;
      continue;
    }

    if (line.startsWith('globs:')) {
      const parsedGlobs = parseGlobs(
        lines,
        lineIndex,
        line.slice('globs:'.length),
      );
      metadata.globs = parsedGlobs.globs;
      lineIndex = parsedGlobs.nextIndex;
      continue;
    }

    throw new Error(`Unsupported frontmatter line: ${line}`);
  }

  return metadata;
};

const splitFrontmatter = (input) => {
  let remainingText = normalizeNewlines(input);
  const metadata = {
    alwaysApply: false,
    description: '',
    globs: [],
  };

  while (remainingText.startsWith('---\n')) {
    const closingMarkerIndex = remainingText.indexOf('\n---\n', 4);

    if (closingMarkerIndex === -1) {
      break;
    }

    const block = remainingText.slice(4, closingMarkerIndex);
    Object.assign(metadata, parseFrontmatterBlock(block));
    remainingText = remainingText.slice(closingMarkerIndex + 5).trimStart();
  }

  return {
    body: remainingText.trimEnd(),
    metadata,
  };
};

const renderFrontmatter = (metadata) => {
  return [
    '---',
    `description: ${JSON.stringify(metadata.description)}`,
    `globs: ${JSON.stringify(metadata.globs)}`,
    `alwaysApply: ${metadata.alwaysApply ? 'true' : 'false'}`,
    '---',
    '',
  ].join('\n');
};

const readManifest = async () => {
  const fileContents = await readFile(manifestPath, 'utf8');
  return JSON.parse(fileContents);
};

const pathExists = async (targetPath) => {
  try {
    await readdir(targetPath);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return false;
    }

    throw error;
  }
};

const copyDirectory = async (sourceDir, targetDir) => {
  await mkdir(targetDir, { recursive: true });

  const entries = await readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, targetPath);
      continue;
    }

    await copyFile(sourcePath, targetPath);
  }
};

const bootstrapRulesFromCursor = async () => {
  const ruleFiles = (await readdir(cursorRulesDir))
    .filter((entry) => entry.endsWith('.mdc'))
    .sort();

  await mkdir(sharedRulesDir, { recursive: true });

  const manifest = {
    note: 'Shared instruction docs are the source of truth. Run `yarn sync:ai-instructions` after editing docs/ai/rules or this manifest.',
    rules: [],
  };

  for (const ruleFile of ruleFiles) {
    const cursorPath = path.join(cursorRulesDir, ruleFile);
    const fileContents = await readFile(cursorPath, 'utf8');
    const { body, metadata } = splitFrontmatter(fileContents);
    const baseName = ruleFile.replace(/\.mdc$/, '');
    const sharedRulePath = path.join(sharedRulesDir, `${baseName}.md`);

    await writeFile(sharedRulePath, `${body}\n`, 'utf8');

    manifest.rules.push({
      alwaysApply: metadata.alwaysApply,
      description: metadata.description,
      filename: `${baseName}.md`,
      globs: metadata.globs,
    });
  }

  await writeFile(`${manifestPath}`, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log(
    `Bootstrapped ${manifest.rules.length} shared AI rule files into ${path.relative(projectRoot, sharedRulesDir)}`,
  );
};

const bootstrapSkillsFromCursor = async () => {
  if (!(await pathExists(cursorSkillsDir))) {
    console.log('Skipped skill bootstrap because .cursor/skills does not exist');
    return;
  }

  await mkdir(sharedSkillsDir, { recursive: true });

  const skillEntries = await readdir(cursorSkillsDir, { withFileTypes: true });
  let bootstrappedSkills = 0;

  for (const entry of skillEntries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const sourceDir = path.join(cursorSkillsDir, entry.name);
    const targetDir = path.join(sharedSkillsDir, entry.name);

    await rm(targetDir, { force: true, recursive: true });
    await copyDirectory(sourceDir, targetDir);
    bootstrappedSkills += 1;
  }

  console.log(
    `Bootstrapped ${bootstrappedSkills} shared AI skill folders into ${path.relative(projectRoot, sharedSkillsDir)}`,
  );
};

const generateCursorRules = async () => {
  const manifest = await readManifest();

  await mkdir(cursorRulesDir, { recursive: true });

  for (const rule of manifest.rules) {
    const sharedRulePath = path.join(sharedRulesDir, rule.filename);
    const cursorRulePath = path.join(
      cursorRulesDir,
      rule.filename.replace(/\.md$/, '.mdc'),
    );
    const ruleBody = (await readFile(sharedRulePath, 'utf8')).trimEnd();

    const renderedRule = `${renderFrontmatter(rule)}${ruleBody}\n`;
    await writeFile(cursorRulePath, renderedRule, 'utf8');
  }

  console.log(
    `Generated ${manifest.rules.length} Cursor rule files from ${path.relative(projectRoot, sharedRulesDir)}`,
  );
};

const generateSharedSkills = async () => {
  if (!(await pathExists(sharedSkillsDir))) {
    console.log('Skipped skill generation because docs/ai/skills does not exist');
    return;
  }

  await mkdir(cursorSkillsDir, { recursive: true });
  await mkdir(claudeSkillsDir, { recursive: true });

  const skillEntries = await readdir(sharedSkillsDir, { withFileTypes: true });
  let generatedSkills = 0;

  for (const entry of skillEntries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const sourceDir = path.join(sharedSkillsDir, entry.name);
    const cursorTargetDir = path.join(cursorSkillsDir, entry.name);
    const claudeTargetDir = path.join(claudeSkillsDir, entry.name);

    await rm(cursorTargetDir, { force: true, recursive: true });
    await rm(claudeTargetDir, { force: true, recursive: true });
    await copyDirectory(sourceDir, cursorTargetDir);
    await copyDirectory(sourceDir, claudeTargetDir);
    generatedSkills += 1;
  }

  console.log(
    `Mirrored ${generatedSkills} shared AI skill folders into ${path.relative(projectRoot, cursorSkillsDir)} and ${path.relative(projectRoot, claudeSkillsDir)}`,
  );
};

const generate = async () => {
  await generateCursorRules();
  await generateSharedSkills();
};

if (mode === '--bootstrap-from-cursor') {
  await bootstrapRulesFromCursor();
  await bootstrapSkillsFromCursor();
} else if (mode === '--bootstrap-rules-from-cursor') {
  await bootstrapRulesFromCursor();
} else if (mode === '--bootstrap-skills-from-cursor') {
  await bootstrapSkillsFromCursor();
} else if (mode === 'generate' || mode === '--generate') {
  await generate();
} else {
  throw new Error(
    `Unknown mode "${mode}". Use --bootstrap-from-cursor, --bootstrap-rules-from-cursor, --bootstrap-skills-from-cursor, or generate.`,
  );
}
