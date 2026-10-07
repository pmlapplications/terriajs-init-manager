/** Thrown for problems the client can fix; `status` is the HTTP status to send. */
export class ApiError extends Error {
  status: 400 | 401 | 403 | 404 | 409;
  constructor(status: ApiError["status"], message: string) {
    super(message);
    this.status = status;
  }
}
