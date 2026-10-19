import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import ts from 'typescript';
/** Find source and test modules whose top-level declarations must document their responsibility. */
async function moduleFiles(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = await Promise.all(entries.map(entry => {
        const path = join(directory, entry.name);
        return entry.isDirectory() ? moduleFiles(path) : /\.(ts|m?js)$/.test(path) ? [path] : [];
    }));
    return files.flat();
}
/** Report top-level declarations and executable statements missing a single-line responsibility comment. */
async function checkFile(path) {
    const text = await readFile(path, 'utf8');
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
    let failures = 0;
    for (const statement of source.statements) {
        if (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement))
            continue;
        const comments = ts.getLeadingCommentRanges(text, statement.getFullStart()) ?? [];
        const last = comments.at(-1);
        if (last && !text.slice(last.pos, last.end).includes('\n'))
            continue;
        const { line } = source.getLineAndCharacterOfPosition(statement.getStart(source));
        console.error(`${path}:${line + 1}: add a one-sentence responsibility comment`);
        failures++;
    }
    return failures;
}
/** Collect all maintained code modules for the declaration-comment check. */
const files = (await Promise.all(['src', 'test', 'scripts', 'website'].map(moduleFiles))).flat();
/** Count comment violations before assigning the command exit code. */
const failures = (await Promise.all(files.map(checkFile))).reduce((sum, count) => sum + count, 0);
// Fail the check when any maintained top-level declaration lacks a responsibility comment.
process.exitCode = failures ? 1 : 0;
