const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { resolveInside } = require('./security.cjs');

const HDL_EXTENSIONS = new Set(['.v', '.sv', '.vh', '.svh']);
const MANIFEST_NAME = '.openbench.json';

const portable = (value) => value.replaceAll('\\', '/');
const isHdl = (value) => HDL_EXTENSIONS.has(path.extname(value).toLowerCase());

function normalizeRelative(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('A project-relative path is required.');
  const normalized = path.normalize(value.trim());
  if (path.isAbsolute(normalized) || normalized === '..' || normalized.startsWith(`..${path.sep}`)) throw new Error('The path must stay inside the project.');
  return portable(normalized);
}

async function discoverHdlFiles(root, directory = root, output = []) {
  const entries = await fsp.readdir(directory, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name.startsWith('.openbench-') || entry.name.startsWith('.rtlbench-')) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) await discoverHdlFiles(root, absolute, output);
    else if (isHdl(entry.name)) output.push(portable(path.relative(root, absolute)));
  }
  return output;
}

async function loadManifest(root) {
  try {
    const parsed = JSON.parse(await fsp.readFile(path.join(root, MANIFEST_NAME), 'utf8'));
    return {
      version: 1,
      name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : path.basename(root),
      files: Array.isArray(parsed.files) ? parsed.files.map(normalizeRelative).filter(isHdl) : [],
      folders: Array.isArray(parsed.folders) ? parsed.folders.map(normalizeRelative).filter((folder) => folder !== '.') : [],
    };
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new Error(`Unable to read ${MANIFEST_NAME}: ${error.message}`);
  }
}

function folderPaths(files, folders = []) {
  const folderSet = new Set(folders.map(normalizeRelative).filter((folder) => folder !== '.'));
  const addParents = (entry, includeEntry) => {
    const parts = portable(entry).split('/');
    const limit = includeEntry ? parts.length : parts.length - 1;
    for (let index = 1; index <= limit; index += 1) folderSet.add(parts.slice(0, index).join('/'));
  };
  files.forEach((file) => addParents(file, false));
  [...folderSet].forEach((folder) => addParents(folder, true));
  return [...folderSet].sort((a, b) => a.localeCompare(b));
}

async function saveManifest(root, manifest) {
  const files = [...new Set(manifest.files.map(normalizeRelative).filter(isHdl))].sort((a, b) => a.localeCompare(b));
  const folders = folderPaths(files, manifest.folders || []);
  const value = { version: 1, name: manifest.name?.trim() || path.basename(root), files, folders };
  await fsp.writeFile(path.join(root, MANIFEST_NAME), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return value;
}

function treeFromEntries(files, folders = []) {
  const root = [];
  const addEntry = (entry, kind) => {
    const parts = portable(entry).split('/');
    let children = root;
    let current = '';
    parts.forEach((part, index) => {
      current = current ? `${current}/${part}` : part;
      if (index === parts.length - 1 && kind === 'file') {
        if (!children.some((node) => node.kind === 'file' && node.name === part)) children.push({ kind: 'file', name: part, path: current });
      }
      else {
        let directory = children.find((node) => node.kind === 'directory' && node.name === part);
        if (!directory) { directory = { kind: 'directory', name: part, path: current, children: [] }; children.push(directory); }
        children = directory.children;
      }
    });
  };
  [...folders].sort((a, b) => a.localeCompare(b)).forEach((folder) => addEntry(folder, 'directory'));
  [...files].sort((a, b) => a.localeCompare(b)).forEach((file) => addEntry(file, 'file'));
  const sortChildren = (children) => {
    children.sort((a, b) => a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'directory' ? -1 : 1);
    children.filter((node) => node.kind === 'directory').forEach((node) => sortChildren(node.children));
  };
  sortChildren(root);
  return root;
}

const treeFromFiles = (files) => treeFromEntries(files, []);

async function projectData(root) {
  const canonical = await fsp.realpath(root);
  const discovered = await discoverHdlFiles(canonical);
  const manifest = await loadManifest(canonical);
  const discoveredSet = new Set(discovered.map((file) => file.toLowerCase()));
  const files = manifest ? manifest.files.filter((file) => discoveredSet.has(file.toLowerCase())) : discovered;
  const folders = [];
  for (const folder of folderPaths(files, manifest?.folders || [])) {
    try { if ((await fsp.stat(resolveInside(canonical, path.join(canonical, folder)))).isDirectory()) folders.push(folder); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return { root: canonical, name: manifest?.name || path.basename(canonical), files, folders, tree: treeFromEntries(files, folders) };
}

async function activateProject(root, selectedFiles, name) {
  const canonical = await fsp.realpath(root);
  const discovered = await discoverHdlFiles(canonical);
  const allowed = new Map(discovered.map((file) => [file.toLowerCase(), file]));
  const selected = selectedFiles.map(normalizeRelative).map((file) => allowed.get(file.toLowerCase())).filter(Boolean);
  await saveManifest(canonical, { name: name || path.basename(canonical), files: selected, folders: [] });
  return projectData(canonical);
}

async function createProject(parent, name, withStarter = true) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._ -]{0,79}$/.test(name || '')) throw new Error('Use a project name containing letters, numbers, spaces, dots, dashes, or underscores.');
  const canonicalParent = await fsp.realpath(parent);
  const root = resolveInside(canonicalParent, path.join(canonicalParent, name));
  try { await fsp.mkdir(root); }
  catch (error) { if (error.code === 'EEXIST') throw new Error(`A folder named “${name}” already exists.`); throw error; }
  const files = [];
  if (withStarter) {
    const moduleName = name.replace(/[^A-Za-z0-9_$]/g, '_').replace(/^[^A-Za-z_$]/, '_$&') || 'design';
    const source = `module ${moduleName}(\n  input  logic clk,\n  input  logic rst_n,\n  output logic led\n);\n  always_ff @(posedge clk or negedge rst_n) begin\n    if (!rst_n) led <= 1'b0;\n    else led <= ~led;\n  end\nendmodule\n`;
    await fsp.writeFile(path.join(root, `${moduleName}.sv`), source, 'utf8');
    const testbenchName = `${moduleName}_tb`;
    const testbench = `\`timescale 1ns/1ps\nmodule ${testbenchName};\n  logic clk = 1'b0;\n  logic rst_n = 1'b0;\n  logic led;\n\n  ${moduleName} dut (.clk(clk), .rst_n(rst_n), .led(led));\n  always #5 clk = ~clk;\n\n  initial begin\n    $dumpfile("${moduleName}.vcd");\n    $dumpvars(0, ${testbenchName});\n    #12 rst_n = 1'b1;\n    #80 $finish;\n  end\nendmodule\n`;
    await fsp.writeFile(path.join(root, `${testbenchName}.sv`), testbench, 'utf8');
    await fsp.writeFile(path.join(root, '.rtlbench.json'), `${JSON.stringify({ topModule: moduleName, simulationTop: testbenchName, includePaths: [], simulator: 'iverilog', toolchainPath: '' }, null, 2)}\n`, 'utf8');
    files.push(`${moduleName}.sv`, `${testbenchName}.sv`);
  }
  await saveManifest(root, { name, files, folders: [] });
  return projectData(root);
}

async function createFile(root, relativePath, content = '') {
  const canonicalRoot = await fsp.realpath(root);
  const relative = normalizeRelative(relativePath);
  if (!isHdl(relative)) throw new Error('OpenBench project files must use .v, .sv, .vh, or .svh.');
  const destination = resolveInside(canonicalRoot, path.join(canonicalRoot, relative));
  await fsp.mkdir(path.dirname(destination), { recursive: true });
  try { await fsp.writeFile(destination, content, { encoding: 'utf8', flag: 'wx' }); }
  catch (error) { if (error.code === 'EEXIST') throw new Error(`${relative} already exists.`); throw error; }
  const manifest = await loadManifest(canonicalRoot) || { name: path.basename(canonicalRoot), files: await discoverHdlFiles(canonicalRoot) };
  await saveManifest(canonicalRoot, { ...manifest, files: [...manifest.files, relative] });
  return relative;
}

async function createFolder(root, relativePath) {
  const canonicalRoot = await fsp.realpath(root);
  const relative = normalizeRelative(relativePath);
  if (relative === '.') throw new Error('Enter a folder name.');
  const destination = resolveInside(canonicalRoot, path.join(canonicalRoot, relative));
  if (fs.existsSync(destination)) throw new Error(`${relative} already exists.`);
  await fsp.mkdir(destination, { recursive: true });
  const manifest = await loadManifest(canonicalRoot) || { name: path.basename(canonicalRoot), files: await discoverHdlFiles(canonicalRoot), folders: [] };
  await saveManifest(canonicalRoot, { ...manifest, folders: [...manifest.folders, relative] });
  return relative;
}

async function importFiles(root, sourcePaths) {
  const canonicalRoot = await fsp.realpath(root);
  const manifest = await loadManifest(canonicalRoot) || { name: path.basename(canonicalRoot), files: await discoverHdlFiles(canonicalRoot) };
  const candidates = sourcePaths.filter(isHdl).map((source) => ({ source, destination: resolveInside(canonicalRoot, path.join(canonicalRoot, path.basename(source))) }));
  const duplicateNames = candidates.map((item) => path.basename(item.destination).toLowerCase()).filter((name, index, values) => values.indexOf(name) !== index);
  if (duplicateNames.length) throw new Error(`More than one selected file is named ${duplicateNames[0]}. Rename one before importing.`);
  for (const item of candidates) if (fs.existsSync(item.destination)) throw new Error(`${path.basename(item.source)} already exists in this project.`);
  const added = [];
  for (const { source, destination } of candidates) {
    await fsp.copyFile(source, destination, fs.constants.COPYFILE_EXCL);
    added.push(path.basename(source));
  }
  await saveManifest(canonicalRoot, { ...manifest, files: [...manifest.files, ...added] });
  return added;
}

async function renameEntry(root, oldRelativePath, newName) {
  const canonicalRoot = await fsp.realpath(root);
  const oldRelative = normalizeRelative(oldRelativePath);
  if (!/^[^\\/:*?"<>|]+$/.test(newName || '') || newName === '.' || newName === '..') throw new Error('Enter a valid file or folder name.');
  const oldAbsolute = resolveInside(canonicalRoot, await fsp.realpath(path.join(canonicalRoot, oldRelative)));
  const oldStat = await fsp.stat(oldAbsolute);
  if (oldStat.isFile() && !isHdl(newName)) throw new Error('HDL files must keep a .v, .sv, .vh, or .svh extension.');
  const newAbsolute = resolveInside(canonicalRoot, path.join(path.dirname(oldAbsolute), newName));
  if (fs.existsSync(newAbsolute)) throw new Error(`${newName} already exists.`);
  const oldPrefix = `${portable(oldRelative).replace(/\/$/, '')}/`;
  const newRelative = portable(path.relative(canonicalRoot, newAbsolute));
  await fsp.rename(oldAbsolute, newAbsolute);
  const manifest = await loadManifest(canonicalRoot);
  if (manifest) {
    const files = manifest.files.map((file) => file === oldRelative ? newRelative : file.startsWith(oldPrefix) ? `${newRelative}/${file.slice(oldPrefix.length)}` : file);
    const folders = manifest.folders.map((folder) => folder === oldRelative ? newRelative : folder.startsWith(oldPrefix) ? `${newRelative}/${folder.slice(oldPrefix.length)}` : folder);
    await saveManifest(canonicalRoot, { ...manifest, files, folders });
  }
  return newRelative;
}

async function removeEntry(root, relativePath, trashItem) {
  const canonicalRoot = await fsp.realpath(root);
  const relative = normalizeRelative(relativePath);
  const absolute = resolveInside(canonicalRoot, await fsp.realpath(path.join(canonicalRoot, relative)));
  await trashItem(absolute);
  const manifest = await loadManifest(canonicalRoot);
  if (manifest) {
    const prefix = `${relative.replace(/\/$/, '')}/`;
    await saveManifest(canonicalRoot, {
      ...manifest,
      files: manifest.files.filter((file) => file !== relative && !file.startsWith(prefix)),
      folders: manifest.folders.filter((folder) => folder !== relative && !folder.startsWith(prefix)),
    });
  }
}

async function duplicateFile(root, relativePath) {
  const canonicalRoot = await fsp.realpath(root);
  const relative = normalizeRelative(relativePath);
  const source = resolveInside(canonicalRoot, await fsp.realpath(path.join(canonicalRoot, relative)));
  const parsed = path.parse(source);
  let counter = 1;
  let destination;
  do { destination = path.join(parsed.dir, `${parsed.name} copy${counter === 1 ? '' : ` ${counter}`}${parsed.ext}`); counter += 1; } while (fs.existsSync(destination));
  await fsp.copyFile(source, destination, fs.constants.COPYFILE_EXCL);
  const added = portable(path.relative(canonicalRoot, destination));
  const manifest = await loadManifest(canonicalRoot) || { name: path.basename(canonicalRoot), files: await discoverHdlFiles(canonicalRoot) };
  await saveManifest(canonicalRoot, { ...manifest, files: [...manifest.files, added] });
  return added;
}

module.exports = { HDL_EXTENSIONS, MANIFEST_NAME, activateProject, createFile, createFolder, createProject, discoverHdlFiles, duplicateFile, importFiles, isHdl, loadManifest, normalizeRelative, projectData, removeEntry, renameEntry, saveManifest, treeFromEntries, treeFromFiles };
