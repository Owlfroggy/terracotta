const noteToPitchMap: Map<string, number> = new Map();
const pitchToNoteMap: Map<number, string> = new Map();

export namespace MCNote {
    export function getPitchFromNote(note: string) {
        return noteToPitchMap.get(note);
    }

    /**
     * If a pitch could correspond to multiple names, naturals will be 
     * preferred over sharps and sharps will be preferred over flats
     */
    export function getNoteFromPitch(pitch: number) {
        return pitchToNoteMap.get(pitch);
    }

    export function getAllNotes(): MapIterator<string> {
        return noteToPitchMap.keys();
    }
}

/** @returns Higher number == higher priority */
function getNotePriority(note: string | undefined): number {
    if (!note) return 0;
    if (note.length == 2) {
        return 3;
    } else if (note.charAt(2) == "#") {
        return 2;
    } else {
        return 1;
    }
}

function addNote(note: string, pitch: number) {
    noteToPitchMap.set(note, pitch);
    if (getNotePriority(note) > getNotePriority(pitchToNoteMap.get(pitch))) {
        pitchToNoteMap.set(pitch, note);
    }
}

addNote("F#0",  0.5);
addNote("Gb0",  0.5);
addNote("G0",   0.529732);
addNote("G#0",  0.561231);
addNote("Ab1",  0.561231);
addNote("A1",   0.594604);
addNote("A1",   0.594604);
addNote("A#1",  0.629961);
addNote("Bb1",  0.629961);
addNote("C1",   0.707107);
addNote("C#1",  0.749154);
addNote("Db1",  0.749154);
addNote("D1",   0.793701);
addNote("D#1",  0.840896);
addNote("Eb1",  0.840896);
addNote("E1",   0.890899);
addNote("F1",   0.943874);
addNote("F#1",  1.0);
addNote("Gb1",  1.0);
addNote("G1",   1.059463);
addNote("G#1",  1.122462);
addNote("Ab2",  1.122462);
addNote("A2",   1.189207);
addNote("A#2",  1.259921);
addNote("Bb2",  1.259921);
addNote("B2",   1.33484);
addNote("C2",   1.414214);
addNote("C#2",  1.498307);
addNote("Db2",  1.498307);
addNote("D2",   1.587401);
addNote("D#2",  1.681793);
addNote("Eb2",  1.681793);
addNote("Eb2",  1.681793);
addNote("E2",   1.781797);
addNote("F2",   1.887749);
addNote("F#2",  2.0);
addNote("Gb2",  2.0);