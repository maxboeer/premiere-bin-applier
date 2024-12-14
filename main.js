import { parse } from "https://deno.land/x/xml/mod.ts";
import { ensureDir, copy } from "https://deno.land/std/fs/mod.ts";
import { join } from "https://deno.land/std/path/mod.ts";
import ProgressBar from "jsr:@deno-library/progress";

let completedItems = 0;

function getAbsoluteFilePath(pathurl) {
  const url = new URL(pathurl);
  let path = decodeURIComponent(url.pathname);
  return path.startsWith("/") ? path.slice(1) : path;
}

async function parseXmlFile(filePath) {
  const xmlContent = await Deno.readTextFile(filePath);
  return parse(xmlContent);
}

function extractBins(xmlObject) {
  const bins = [];

  function traverse(node, path) {
    if (node.bin) {
      if (Array.isArray(node.bin)) {
        node.bin.forEach(bin => {
          const binName = bin.name;
          const binPath = join(path, binName);
          bins.push({ type: "dir", path: binPath });
          if (bin.children) {
            traverse(bin.children, binPath);
          }
        });
      } else {
        const binName = node.bin.name;
        const binPath = join(path, binName);
        bins.push({ type: "dir", path: binPath });
        if (node.bin.children) {
          traverse(node.bin.children, binPath);
        }
      }
    }
    if (node.clip) {
      if (Array.isArray(node.clip)) {
        node.clip.forEach(clip => {
          const clipPath = join(path, clip.name);
          const filePath = getAbsoluteFilePath(clip.media.video.track.clipitem.file.pathurl);
          bins.push({ type: "file", path: clipPath, filePath });
        });
      } else {
        const clipPath = join(path, node.clip.name);
        const filePath = getAbsoluteFilePath(node.clip.media.video.track.clipitem.file.pathurl);
        bins.push({ type: "file", path: clipPath, filePath });
      }
    }
  }

  traverse(xmlObject.xmeml.project.children, "");
  return bins;
}

async function createDirectories(bins, targetFolder) {
  const dirTasks = bins
      .filter(bin => bin.type === "dir")
      .map(async bin => {
        const dirPath = join(targetFolder, bin.path);
        await ensureDir(dirPath);
        completedItems++;
      });
  await Promise.all(dirTasks);
}

async function handleFiles(bins, targetFolder, deleteOriginals, createSymlinks) {
  const totalItems = bins.length;
  const errors = [];
  const skippedFiles = [];
  const progressBar = new ProgressBar({
    total: totalItems
  });
  await progressBar.render(0);

  const fileTasks = bins
      .filter(bin => bin.type === "file")
      .map(async bin => {
        try {
          const targetPath = join(targetFolder, bin.path);
          const sourcePath = bin.filePath;
          try {
            await Deno.lstat(targetPath);
            skippedFiles.push(bin.path);
            completedItems++;
            await progressBar.render(completedItems);
            return;
          } catch (e) {
            if (e instanceof Deno.errors.NotFound) {
              if (createSymlinks) {
                await Deno.symlink(sourcePath, targetPath, { type: "file" });
              } else {
                await copy(sourcePath, targetPath);
                if (deleteOriginals) {
                  await Deno.remove(sourcePath);
                }
              }
              completedItems++;
              await progressBar.render(completedItems);
            } else {
              throw e;
            }
          }
        } catch (error) {
          completedItems++;
          await progressBar.render(completedItems);
          console.error(`%cError encountered while processing item: ${bin.path}`, "color: red");
          errors.push({ item: bin.path, error: error.message });
        }
      });

  await Promise.all(fileTasks);

  if (skippedFiles.length > 0) {
    console.log("%cSkipped files:", "color: yellow");
    skippedFiles.forEach(file => console.log(`%c    - ${file}`, "color: yellow"));
  }

  if (errors.length > 0) {
    console.error("%cErrors encountered during the process:", "color: red");
    errors.forEach(err => console.error(`%c    - Item: ${err.item}, Error: ${err.error}`, "color: red"));
  }
}

async function main() {
  const args = Deno.args;
  const xmlFilePath = args.find(arg => !arg.startsWith("--"));
  const targetFolder = args.find(arg => !arg.startsWith("--") && arg !== xmlFilePath);
  const deleteFlag = args.includes("--delete");
  const symlinkFlag = args.includes("--symlink");

  if (!xmlFilePath || !targetFolder) {
    console.error("%cUsage: deno run --allow-read --allow-write main.js <xmlFilePath> <targetFolder> [--delete] [--symlink]", "color: yellow");
    Deno.exit(1);
  }

  if (deleteFlag && symlinkFlag) {
    console.error("%cError: --delete and --symlink flags cannot be used together.", "color: red");
    Deno.exit(1);
  }

  try {
    const xmlObject = await parseXmlFile(xmlFilePath);
    const bins = extractBins(xmlObject);
    console.log(`${symlinkFlag ? "Creating symlinks for" : (deleteFlag ? "Moving" : "Copying")} ${bins.length} items from ${xmlFilePath} to ${targetFolder}`);
    console.log(`Creating directories...`);
    await createDirectories(bins, targetFolder);
    console.log(`${symlinkFlag ? "Creating symlinks for" : (deleteFlag ? "Moving" : "Copying")} files...`);
    await handleFiles(bins, targetFolder, deleteFlag, symlinkFlag);
    console.log("%cProcess completed.", "color: green");
  } catch (error) {
    console.error(`%cError: ${error.message}`, "color: red");
  }
}

main();