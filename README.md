# Premiere Bin Applier
An app that lets you apply the bin structure from inside premiere pro to you local file system.

## How it works
The app reads the bin structure from an XML file exported from Premiere Pro and applies it to a target folder.
It will create the same folder structure and copy the files from the bins to the target folder.
It can also create symlinks or move the files instead of copying them.
The used language is JavaScript and the app is built using [Deno](https://deno.com).

## How to use
### Using the executable
1. Export your Premiere Pro project as an XML file _(File -> Export -> Final Cut Pro XML)_
2. ~~Download the latest release from the releases page~~ _(coming soon)_
3. Run the executable with the following arguments:
```bash
premiere-bin-applier.exe <xmlFilePath> <targetFolder> [--delete] [--symlink]
```

### Alternative usage
1. Export your Premiere Pro project as an XML file _(File -> Export -> Final Cut Pro XML)_
2. Clone the repository
3. Run the program by running:
```bash
deno run dev <xmlFilePath> <targetFolder> [--delete] [--symlink]
```
3. Or build the program running:
```bash
deno run build
```

### Arguments
- ```xmlFilePath```:The path to the xml file that contains the bin structure
- ```targetFolder```: The path to the folder where the bin structure should be applied
- ```--delete```: Optional argument that will move the files instead of copying them
- ```--symlink```: Optional argument that will create symlinks instead of copying the files