export class Type {
    public static registry: {[name: string]: Type} = {};
    
    public static any = new Type('any');
    public static num = new Type('num');
    public static str = new Type('str');
    public static txt = new Type('txt');
    public static list = new Type('list');
    public static dict = new Type('dict');
    public static item = new Type('item');
    public static loc = new Type('loc');
    public static vec = new Type('vec');
    public static pot = new Type('pot');
    public static par = new Type('par');
    public static snd = new Type('snd');
    public static var = new Type('var');
    public static unknown = this.any; // just in case unknown type ever needs to be separated


    constructor(
        public readonly name: string
    ) {
        if (name in Type.registry) {
            throw new Error(`Attempted to register type '${name}' even though a type of that name already exists`);
        }
        Type.registry[name] = this;
    }
}