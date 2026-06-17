export type Locale = "en" | "fr";

export interface Messages {
  common: {
    loading: string;
    error: string;
    success: string;
    cancel: string;
    save: string;
    delete: string;
    edit: string;
    add: string;
    search: string;
    close: string;
  };
  navigation: {
    home: string;
    shelves: string;
    profile: string;
    login: string;
    register: string;
    logout: string;
  };
  auth: {
    email: string;
    password: string;
    confirmPassword: string;
    loginTitle: string;
    registerTitle: string;
    forgotPassword: string;
    alreadyHaveAccount: string;
    dontHaveAccount: string;
    loginButton: string;
    registerButton: string;
  };
  shelves: {
    title: string;
    addShelf: string;
    editShelf: string;
    shelfName: string;
    shelfDescription: string;
    noShelves: string;
    createFirstShelf: string;
  };
  items: {
    title: string;
    addItem: string;
    editItem: string;
    itemName: string;
    itemDescription: string;
    condition: string;
    location: string;
    noItems: string;
    addFirstItem: string;
  };
  app: {
    name: string;
    description: string;
  };
}

export type MessageKey = keyof Messages;
export type NestedMessageKey<T extends keyof Messages> = keyof Messages[T];
