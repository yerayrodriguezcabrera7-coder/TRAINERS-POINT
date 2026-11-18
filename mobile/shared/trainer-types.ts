export interface AttendanceRecord {
  id:string;
  employeeId:string;
  clockIn:string;
  clockOut:string|null;
  centerName?:string;
  pauses?:Array<{startedAt:string;endedAt?:string}>;
}
export interface AttendanceData {
  records:AttendanceRecord[];
  openRecords:AttendanceRecord[];
  centerLocation?:{latitude:number;longitude:number;radiusMeters:number}|null;
  timezone:string;
  serverNow:string;
  dayStart:string;
  dayEnd:string;
}
export interface TrainerClientDetail {
  client:{id:string;firstName:string;lastName:string;injuries?:string[]|null;injuryNotes?:string|null;notes?:string|null;status:string;clientNotes:Array<{id:string;content:string;createdAt:string;category:string}>};
  measurements:Array<{id:string;measuredAt:string;weight:number|null;bodyFat:number|null;waist:number|null;hip:number|null;chest:number|null;arm:number|null;leg:number|null}>;
  packages:Array<{id:string;serviceName:string;sessionsRemaining:number;sessionsBought:number;expiresAt:string;paymentStatus:string}>;
}
