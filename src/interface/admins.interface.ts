import { Document } from 'mongoose';

export interface IAdmin extends Document{
    readonly fname: string;
    readonly lname: string;
    readonly username: string;
    readonly password: string;
    readonly otp: number;
    readonly access: string;
}