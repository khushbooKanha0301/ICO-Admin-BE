import { Document } from 'mongoose';

export interface IPermission extends Document{
    readonly permission_id: number;
    readonly permission_name: string;
    readonly createdAt: string;
    readonly updateAt: string;
}
