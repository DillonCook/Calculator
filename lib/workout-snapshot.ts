export interface WorkoutSnapshot { purchasePrice:number; downPaymentPercent:number; }
/** Copy only authorized fields, including when data came from an older local record. */
export function readWorkoutSnapshot(value:unknown): WorkoutSnapshot | null {
 if(!value || typeof value!=='object' || Array.isArray(value))return null;
 const {purchasePrice,downPaymentPercent}=value as Partial<WorkoutSnapshot>;
 if(typeof purchasePrice!=='number' || !Number.isFinite(purchasePrice) || purchasePrice<0 || purchasePrice>1e12 || typeof downPaymentPercent!=='number' || !Number.isFinite(downPaymentPercent) || downPaymentPercent<0 || downPaymentPercent>1)return null;
 return {purchasePrice,downPaymentPercent};
}
