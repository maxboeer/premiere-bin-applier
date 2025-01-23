import { parse } from "https://deno.land/x/xml/mod.ts";
import { ensureDir, copy } from "https://deno.land/std/fs/mod.ts";
import { join } from "https://deno.land/std/path/mod.ts";
import ProgressBar from "jsr:@deno-library/progress";

let completedItems = 0;
const skippedFiles = [];

function getAbsoluteFilePath(pathurl) {
  const url = new URL(pathurl);
  let path = decodeURIComponent(url.pathname);
  return path.startsWith("/") ? path.slice(1) : path;
}

async function parseXmlFile(filePath) {
  const xmlContent = await Deno.readTextFile(filePath);
  return parse(xmlContent);
}

function findFilePathById(fileId, xmlObject) {
  let pathurl = null;

  function traverse(node) {
    if (pathurl) return; // Stop traversing if pathurl is found

    if (node && node.file && Array.isArray(node.file)) {
      for (const file of node.file) {
        if (file["@id"] === fileId && file.pathurl) {
          pathurl = file.pathurl;
          return;
        }
      }
    } else if (node && node.file && node.file["@id"] === fileId && node.file.pathurl) {
      pathurl = node.file.pathurl;
      return;
    }

    for (const key in node) {
      if (node && typeof node[key] === 'object') {
        traverse(node[key]);
      }
    }
  }

  traverse(xmlObject);
  if (!pathurl)
    return null;
  return getAbsoluteFilePath(pathurl);
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
          if (clip.name.endsWith(".aep")) return;
          const clipPath = join(path, clip.name);
          let filePath;

          if(clip.media.video) {
              filePath = findFilePathById(clip.media.video.track.clipitem.file["@id"], xmlObject);
          }else if (clip.media.audio) {
            if (Array.isArray(clip.media.audio.track)){
                filePath = findFilePathById(clip.media.audio.track[0].clipitem.file["@id"], xmlObject);
            }else{
                filePath = findFilePathById(clip.media.audio.track.clipitem.file["@id"], xmlObject);
            }
          }

          if (!filePath)
            skippedFiles.push(clipPath);
          else
            bins.push({type: "file", path: clipPath, filePath});
        });
      } else {
        const clip = node.clip;
        if (clip.name.endsWith(".aep")) return;
        const clipPath = join(path, clip.name);
        let filePath;

        if(clip.media.video) {
          filePath = findFilePathById(clip.media.video.track.clipitem.file["@id"], xmlObject);
        }else if (clip.media.audio) {
          if (Array.isArray(clip.media.audio.track)){
            filePath = findFilePathById(clip.media.audio.track[0].clipitem.file["@id"], xmlObject);
          }else{
            filePath = findFilePathById(clip.media.audio.track.clipitem.file["@id"], xmlObject);
          }
        }

        if (!filePath)
          skippedFiles.push(clipPath);
        else
          bins.push({type: "file", path: clipPath, filePath});
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

async function writeChangedFilesToJson(bins, targetFolder) {
  const changedFiles = bins
    .filter(bin => bin.type === "file")
    .map(bin => ({
      oldPath: bin.filePath,
      newPath: join(targetFolder, bin.path)
    }));

  const jsonFilePath = join(targetFolder, "migrationInfo.json");
  const jsonContent = JSON.stringify(changedFiles, null, 2);
  await Deno.writeTextFile(jsonFilePath, jsonContent);
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
    console.log("Writing migration info to JSON...");
    writeChangedFilesToJson(bins, targetFolder);
    console.log("%cProcess completed.", "color: green");
  } catch (error) {
    console.error(`%cError: ${error.message}`, "color: red");
  }
}

main();