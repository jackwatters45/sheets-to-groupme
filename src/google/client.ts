export interface GoogleSheetsClient {
  fetchRows(sheetId: string, range: string): Promise<readonly string[][]>;
}

export const GoogleSheetsClient = {
  fetchRows: async (_sheetId: string, _range: string): Promise<readonly string[][]> => {
    return [];
  },
} satisfies GoogleSheetsClient;
