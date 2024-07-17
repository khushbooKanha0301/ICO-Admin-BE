import { Document } from 'mongoose';

export interface IAdmin extends Document{
    readonly fname: string;
    readonly lname: string;
    readonly username: string;
    readonly password: string;
    readonly otp: number;
    readonly access: string;
    readonly role_id: number;
    readonly role_name: string;
    readonly permissions: {
      length: number; permission_id: number; permission_name: string 
}[];
    readonly createdAt: string;
    readonly updateAt: string;
}