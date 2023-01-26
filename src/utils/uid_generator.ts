export class UIDGenerator {
    counters: { [base: string]: number };

    constructor() {
        this.counters = {};
    }

    get(name: string): string {
        if (!(name in this.counters)) {
            this.counters[name] = 0;
        }

        return name + this.counters[name]++;
    }

    getRaw(name: string): number {
        if (!(name in this.counters)) {
            this.counters[name] = 0;
        }

        return this.counters[name]++;
    }

    reset(): void {
        this.counters = {};
    }
}
