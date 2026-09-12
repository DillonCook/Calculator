'use client';
import { useState, type Dispatch, type SetStateAction } from 'react';
import type { DealInputModel } from '@/lib/models/deal';

/** Owns editor state. Cloud sync, auth and storage still use the existing queue. */
export function useDealEditor(initial:()=>DealInputModel,onDirty:()=>void) {
  const [model,setModel]=useState(initial);
  const updateModel:Dispatch<SetStateAction<DealInputModel>> = nextModel=>{
    onDirty();
    setModel(current=>{
      const next=typeof nextModel==='function'?nextModel(current):nextModel;
      const inputChanged=next.purchase!==current.purchase || next.longTerm!==current.longTerm || next.airbnb!==current.airbnb || next.padSplit!==current.padSplit || next.brrrr!==current.brrrr || next.flip!==current.flip || next.commercial!==current.commercial || next.variableExpenses!==current.variableExpenses || next.assumptions!==current.assumptions;
      return inputChanged && next.analysis?.assumptionsReviewed ? {...next,analysis:{...next.analysis,assumptionsReviewed:false}}:next;
    });
  };
  return {model,setModel,updateModel};
}
