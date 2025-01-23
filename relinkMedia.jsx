(function () {
    // JSON-Parser für ExtendScript
    function parseJSON(jsonString) {
        try {
            return eval('(' + jsonString + ')');
        } catch (e) {
            throw new Error("JSON-Parsing fehlgeschlagen. Überprüfe die Syntax der JSON-Datei.");
        }
    }

    try {
        // Lade das aktuelle Projekt
        var project = app.project;
        if (!project) {
            throw new Error("Kein Projekt geöffnet. Bitte ein Projekt in Premiere Pro öffnen.");
        }

        // Projektpfad und JSON-Datei festlegen
        var projectPath = project.path;
        if (!projectPath) {
            throw new Error("Das Projekt wurde noch nicht gespeichert. Bitte speichere das Projekt zuerst.");
        }
        var projectFolder = projectPath.substring(0, projectPath.lastIndexOf("/") != -1 ? projectPath.lastIndexOf("/") : projectPath.lastIndexOf("\\"));
        var jsonFilePath = projectFolder + "/migrationInfo.json";
        var logFilePath = projectFolder + "/relinkLog.txt";

        // JSON-Datei einlesen
        var file = new File(jsonFilePath);
        if (!file.exists) {
            throw new Error("Die JSON-Datei 'migrationInfo.json' wurde nicht gefunden: " + jsonFilePath);
        }
        file.open("r");
        var jsonContent = file.read();
        file.close();

        var mediaPaths;
        try {
            mediaPaths = parseJSON(jsonContent);
        } catch (e) {
            throw new Error("Die JSON-Datei ist ungültig. Überprüfe die Syntax.\n\n" + e.message);
        }

        // Überprüfung: JSON sollte ein Array von Objekten mit oldPath und newPath sein
        // if (!Array.isArray(mediaPaths)) {
        //     throw new Error("Die JSON-Datei sollte ein Array von Objekten mit 'oldPath' und 'newPath' enthalten.");
        // }

        // Alle Dateien im Projekt durchgehen
        var rootItem = project.rootItem;
        var relinkedCount = 0;
        var errors = [];
        var logMessages = [];

        function processItem(item) {
            if (item.type === ProjectItemType.CLIP || item.type === ProjectItemType.FILE) {
                var oldPath = item.getMediaPath();
                var oldPathForwardSlashes = oldPath.replace(/\\/g, "/");

                // Nach dem neuen Pfad suchen
                var newPath = null;
                for (var i = 0; i < mediaPaths.length; i++) {
                    if (mediaPaths[i].oldPath === oldPathForwardSlashes) {
                        newPath = mediaPaths[i].newPath;
                        break;
                    }
                }

                if (newPath) {
                    try {
                        var newFile = new File(newPath);
                        if (newFile.exists) {
                            item.changeMediaPath(newPath); // Speicherort ändern
                            relinkedCount++;
                            logMessages.push("Relinked: " + oldPath + " -> " + newPath);
                        } else {
                            errors.push("Neue Datei existiert nicht: " + newPath);
                        }
                    } catch (e) {
                        errors.push("Fehler beim Relinken: " + oldPath + " -> " + newPath + " (" + e.message + ")");
                    }
                }
            }

            // Falls es sich um einen Ordner handelt, rekursiv Unterelemente verarbeiten
            if (item.children && item.children.numItems > 0) {
                for (var j = 0; j < item.children.numItems; j++) {
                    processItem(item.children[j]);
                }
            }
        }

        // Start: Alle Root-Items verarbeiten
        for (var i = 0; i < rootItem.children.numItems; i++) {
            processItem(rootItem.children[i]);
        }

        // Zusammenfassung und Logdatei schreiben
        var summary = "Relink abgeschlossen.\n" +
            "Anzahl erfolgreich relinkter Dateien: " + relinkedCount + "\n" +
            "Anzahl Fehler: " + errors.length + "\n";

        if (errors.length > 0) {
            summary += "Fehler:\n" + errors.join("\n");
        }

        logMessages.unshift(summary); // Zusammenfassung an den Anfang setzen
        var logFile = new File(logFilePath);
        logFile.open("w");
        logFile.write(logMessages.join("\n"));
        logFile.close();

        // Ergebnis anzeigen
        alert(summary);
    } catch (e) {
        alert("Ein Fehler ist aufgetreten: " + e.message);
    }
})();