export interface UserContact {
  name: string;
  email?: string;
  phone?: string;
}

export const UserContact = {
  is: (value: unknown): value is UserContact => {
    return (
      typeof value === "object" &&
      value !== null &&
      "name" in value &&
      typeof (value as UserContact).name === "string"
    );
  },
};
