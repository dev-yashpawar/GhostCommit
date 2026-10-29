import {create} from 'zustand';
import {persist} from 'zustand/middleware';
export const useWorkspace=create<{repoId:string;setRepoId:(id:string)=>void;patchId:string;setPatchId:(id:string)=>void}>()(persist(set=>({repoId:'',setRepoId:repoId=>set({repoId}),patchId:'',setPatchId:patchId=>set({patchId})}),{name:'ghostcommit-workspace'}));
