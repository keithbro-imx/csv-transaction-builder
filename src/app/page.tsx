"use client";

import { TxBuilder } from "@morpho-labs/gnosis-tx-builder";
import { ChangeEvent, useState } from "react";
import Papa from "papaparse";
import { Contract, parseEther } from "ethers";
import { BatchFile } from "@morpho-labs/gnosis-tx-builder/lib/src/types";

const safeAddress = "0xaA53161A1fD22b258c89bA76B4bA11019034612D";

const newErc20Contract = (contractAddress: string) =>
  new Contract(contractAddress, [
    "function transfer(address to, uint amount) returns (bool)",
  ]);

const buildData = (
  erc20Address: string,
  recipientAddress: string,
  baseAmount: string
) => {
  const unitAmount = parseEther(baseAmount);
  const data = newErc20Contract(erc20Address).interface.encodeFunctionData(
    "transfer",
    [recipientAddress, unitAmount]
  );
  return data;
};

const buildNativeTransaction = (recipientAddress: string, value: string) => ({
  to: recipientAddress,
  value: parseEther(value).toString(),
});

const buildERC20Transaction = (
  erc20Address: string,
  recipientAddress: string,
  amount: string
) => ({
  to: erc20Address,
  value: "0",
  data: buildData(erc20Address, recipientAddress, amount),
});

const parse = (csv: string) => {
  const headerDetected = !csv.startsWith("0x");
  const { data } = Papa.parse<[string, string]>(csv, { skipEmptyLines: true });
  if (headerDetected) data.shift();
  return data;
};

const buildTransactions = (erc20Address: string, rows: [string, string][]) => {
  if (erc20Address) {
    return rows.map(([recipientAddress, amount]) =>
      buildERC20Transaction(erc20Address, recipientAddress, amount)
    );
  }
  return rows.map(([recipientAddress, amount]) =>
    buildNativeTransaction(recipientAddress, amount)
  );
};

const createBatchJson = (file: File, erc20Address: string) => {
  const reader = new FileReader();

  return new Promise<BatchFile>((resolve, reject) => {
    reader.onload = (e) => {
      if (!e.target) {
        reject("err: no target");
        return;
      }

      const result = e.target.result;
      if (typeof result !== "string") {
        reject("err: not a string");
        return;
      }

      const rows = parse(result);
      const transactions = buildTransactions(erc20Address, rows);

      const batchJson = TxBuilder.batch(safeAddress, transactions, {
        chainId: 13371,
      });

      resolve(batchJson);
    };

    reader.readAsText(file);
  });
};

export default function Home() {
  const [batchFile, setBatchFile] = useState("");
  const [csvFile, setCsvFile] = useState<File | null>();
  const [erc20Address, setErc20Address] = useState("");

  const handleErc20AddressChange = (e: ChangeEvent<HTMLInputElement>) => {
    setErc20Address(e.target.value);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    setCsvFile(e.target.files[0]);
  };

  const handleClick = () => {
    if (!csvFile) return;
    createBatchJson(csvFile, erc20Address).then((file) =>
      setBatchFile(JSON.stringify(file, null, 2))
    );
  };

  return (
    <main className="flex min-h-screen flex-col justify-between p-4 gap-4">
      <label>ERC20 Address (blank for native IMX)</label>
      <input
        type="text"
        placeholder="0x"
        onChange={handleErc20AddressChange}
        className="w-full"
      />
      <input onChange={handleFileChange} type="file" accept="text/csv" />
      <textarea rows={20} className="w-full" value={batchFile} />
      <button
        disabled={!csvFile}
        onClick={handleClick}
        className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
      >
        Transform
      </button>
    </main>
  );
}
