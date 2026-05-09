#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'scripts', 'guard-trustmyrecord-publish.ps1'), 'utf8');

assert(source.includes('$ExpectedRoot = "C:\\Users\\Nima\\trustmyrecord"'), 'publish guard must stay pinned to the canonical working tree');
assert(source.includes('$ExpectedRemote = "github.com/Nimadamus/trustmyrecord.git"'), 'publish guard must stay pinned to the canonical remote');
assert(source.includes('$ExpectedBranch = "main"'), 'publish guard must stay pinned to main');
assert(source.includes('[switch]$SkipPredeployGuard'), 'publish guard must require an explicit switch to bypass predeploy');
assert(source.includes('scripts\\predeploy-guard.ps1'), 'publish guard must locate the predeploy guard');
assert(source.includes('& pwsh -File $PredeployGuard -Root $Root -SkipRemoteCheck'), 'publish guard must run predeploy before approving publish');
assert(source.includes('Fail "Predeploy guard failed. Refusing publish."'), 'publish guard must refuse publish when predeploy fails');
assert(source.includes('git status --porcelain'), 'publish guard must keep dirty worktree protection');
assert(source.includes('git merge-base $LocalHead $RemoteHead'), 'publish guard must keep remote ancestry protection');

console.log('publish guard regression test passed');
