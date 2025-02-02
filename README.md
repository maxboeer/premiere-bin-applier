# Premiere Bin Applier
An app that lets you apply the bin structure from inside premiere pro to your local file system. It comes with an ExtendScript for relinking the files in Premiere Pro.

## How it works
The app reads the bin structure from an XML file exported from Premiere Pro and applies it to a target folder.
It will create the same folder structure and copy the files from the bins to the target folder.
It can also create symlinks or move the files instead of copying them.
The files can then be relinked in Premiere Pro using the [```relinkMedia.jsx```](ExtendScripts/relinkMedia.jsx) ExtendScript and a ```migrationInfo.json``` generated by the app..

The used language is JavaScript and the app is built using [Deno](https://deno.com).

## How to use
### Applying the bin structure
#### Using the executable
1. Export your Premiere Pro project as an XML file _(File -> Export -> Final Cut Pro XML)_
2. Download the latest release from the releases page
3. Run the executable with the following arguments:
```bash
premiere-bin-applier.exe <xmlFilePath> <targetFolder> [--delete] [--symlink]
```
Example usage:
```bash
./premiere-bin-applier.exe "C:\project.xml" "D:\premiere_projects\project\src" --delete
```

#### Alternative usage
1. Export your Premiere Pro project as an XML file _(File -> Export -> Final Cut Pro XML)_
2. Clone the repository
3. Run the program by running:
```bash
deno run dev <xmlFilePath> <targetFolder> [--delete] [--symlink]
```
3. Or build the program by running:
```bash
deno run build
```

#### Arguments
- ```xmlFilePath```: The path to the xml file that contains the bin structure
- ```targetFolder```: The path to the folder where the bin structure should be applied
- ```--delete```: Optional argument that will move the files instead of copying them
- ```--symlink```: Optional argument that will create symlinks instead of copying the files

### Relinking the media
1. Download a plugin that allows you to run ExtendScripts in Premiere Pro (e.g. [JSX Launcher](https://exchange.adobe.com/apps/cc/12096/jsx-launcher))
2. Place the previously generated ```migrationInfo.json``` (located inside the target directory) next to the project file (.prproj)
3. Run the [```relinkMedia.jsx```](ExtendScripts/relinkMedia.jsx) script in Premiere Pro