import { clearScreenDown } from "readline";

export class ProfileModel {
    id: string;
    name:string
 
    identities:Identities[]


    constructor(partial?: Partial<ProfileModel>) {
        Object.assign(this, partial);
    }
}
export class Identities{
    platform:string;
    username:string;
    verified:boolean
}