import { atom } from 'jotai';

export const presenceAtom = atom([]);

export const socketStatusAtom = atom('connecting');

export const publishAtom = atom(null);    // safePublish 보관
export const setWorkingAtom = atom(null); // setWorking 보관