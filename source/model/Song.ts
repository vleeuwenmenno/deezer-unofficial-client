export default class Song 
{
    name: string;
    artist: string;
    time: number;
    listening: boolean;
    isFav:boolean;

    constructor(name: string, artist: string, time: number, listening: boolean = true, isFav: boolean = false) 
    {
        this.name = name;
        this.artist = artist;
        this.time = time;
        this.listening = listening;
        this.isFav = isFav;
    }
}
