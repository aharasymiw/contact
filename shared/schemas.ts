import { z } from "zod";

export const signalKindSchema = z.enum(["offer", "answer", "ice-candidate"]);
export const callStatusSchema = z.enum(["ringing", "accepted", "rejected", "ended"]);

export const userSchema = z.object({
  id: z.string().min(1),
  username: z.string().min(1),
  displayName: z.string().min(1),
  createdAt: z.string().min(1),
});

export const presenceUserSchema = userSchema.extend({
  online: z.boolean(),
});

export const iceServerSchema = z.object({
  urls: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
  username: z.string().min(1).optional(),
  credential: z.string().min(1).optional(),
});

export const remoteCallSchema = z.object({
  id: z.string().min(1),
  status: callStatusSchema,
  direction: z.enum(["incoming", "outgoing"]),
  peerUserId: z.string().min(1),
  callerUserId: z.string().min(1),
  calleeUserId: z.string().min(1),
  createdAt: z.string().min(1),
  answeredAt: z.string().min(1).nullable().optional(),
  endedAt: z.string().min(1).nullable().optional(),
});

export const incomingInviteSchema = z.object({
  call: remoteCallSchema,
  fromUser: userSchema,
});

export const authenticatedSessionSchema = z.object({
  authenticated: z.literal(true),
  currentUser: userSchema,
  iceServers: z.array(iceServerSchema),
  users: z.array(presenceUserSchema),
  pendingInvites: z.array(incomingInviteSchema),
});

export const anonymousSessionSchema = z.object({
  authenticated: z.literal(false),
  iceServers: z.array(iceServerSchema),
});

export const bootstrapPayloadSchema = z.union([authenticatedSessionSchema, anonymousSessionSchema]);

export const usersPayloadSchema = z.object({
  users: z.array(presenceUserSchema),
});

export const inviteCallRequestSchema = z.object({
  calleeUserId: z.string().min(1),
});

export const inviteCallResponseSchema = z.object({
  call: remoteCallSchema,
  toUser: userSchema,
});

export const respondToCallRequestSchema = z.object({
  accept: z.boolean(),
});

export const respondToCallResponseSchema = z.object({
  accepted: z.boolean(),
  call: remoteCallSchema,
});

export const relaySignalRequestSchema = z.object({
  kind: signalKindSchema,
  payload: z.unknown(),
});

export const relaySignalResponseSchema = z.object({
  ok: z.boolean(),
  relayedToUserId: z.string().min(1),
});

export const endCallResponseSchema = z.object({
  call: remoteCallSchema,
});

export const connectedEventPayloadSchema = z.object({
  message: z.string().min(1),
  onlineUserIds: z.array(z.string().min(1)),
  pendingInvites: z.array(incomingInviteSchema),
});

export const presenceUpdateEventPayloadSchema = z.object({
  onlineUserIds: z.array(z.string().min(1)),
});

export const callInviteEventPayloadSchema = z.object({
  call: remoteCallSchema,
  fromUser: userSchema,
});

export const callResponseEventPayloadSchema = z.object({
  accepted: z.boolean(),
  call: remoteCallSchema,
  fromUser: userSchema,
});

export const callSignalEventPayloadSchema = z.object({
  callId: z.string().min(1),
  kind: signalKindSchema,
  payload: z.unknown(),
  fromUser: userSchema,
});

export const callEndedEventPayloadSchema = z.object({
  call: remoteCallSchema,
  fromUser: userSchema,
});

export type SignalKind = z.infer<typeof signalKindSchema>;
export type CallStatus = z.infer<typeof callStatusSchema>;
export type User = z.infer<typeof userSchema>;
export type PresenceUser = z.infer<typeof presenceUserSchema>;
export type IceServerConfig = z.infer<typeof iceServerSchema>;
export type RemoteCall = z.infer<typeof remoteCallSchema>;
export type IncomingInvite = z.infer<typeof incomingInviteSchema>;
export type BootstrapPayload = z.infer<typeof bootstrapPayloadSchema>;
export type AuthenticatedSessionPayload = z.infer<typeof authenticatedSessionSchema>;
export type UsersPayload = z.infer<typeof usersPayloadSchema>;
export type InviteCallRequest = z.infer<typeof inviteCallRequestSchema>;
export type InviteCallResponse = z.infer<typeof inviteCallResponseSchema>;
export type RespondToCallRequest = z.infer<typeof respondToCallRequestSchema>;
export type RespondToCallResponse = z.infer<typeof respondToCallResponseSchema>;
export type RelaySignalRequest = z.infer<typeof relaySignalRequestSchema>;
export type RelaySignalResponse = z.infer<typeof relaySignalResponseSchema>;
export type EndCallResponse = z.infer<typeof endCallResponseSchema>;
export type ConnectedEventPayload = z.infer<typeof connectedEventPayloadSchema>;
export type PresenceUpdateEventPayload = z.infer<typeof presenceUpdateEventPayloadSchema>;
export type CallInviteEventPayload = z.infer<typeof callInviteEventPayloadSchema>;
export type CallResponseEventPayload = z.infer<typeof callResponseEventPayloadSchema>;
export type CallSignalEventPayload = z.infer<typeof callSignalEventPayloadSchema>;
export type CallEndedEventPayload = z.infer<typeof callEndedEventPayloadSchema>;
