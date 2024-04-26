"use client";

import { TxBuilder } from "@morpho-labs/gnosis-tx-builder";
import { ChangeEvent, useState } from "react";
import Papa from "papaparse";
import { parseEther, JsonRpcProvider, Contract, parseUnits } from "ethers";
import { BatchFile, BatchTransaction } from "@morpho-labs/gnosis-tx-builder/lib/src/types";

type ERC20 = {
  address: string;
  decimals: BigInt;
  symbol: string;
}

const safeAddress = "0xaA53161A1fD22b258c89bA76B4bA11019034612D";
const rpcUrl = 'https://rpc.immutable.com'

const newErc20Contract = (contractAddress: string) =>
    new Contract(contractAddress, [
      "function decimals() view returns (uint8)",
      "function symbol() view returns (string)",
    ], new JsonRpcProvider(rpcUrl));

const buildNativeTransaction = (recipientAddress: string, value: string) => ({
  to: recipientAddress,
  value: parseEther(value).toString(),
});

const buildERC20Transaction = (
  erc20: ERC20,
  recipientAddress: string,
  amount: string
): BatchTransaction => ({
  to: erc20.address,
  value: "0",
  contractMethod: {
    name: "transfer",
    inputs: [
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
    ],
    payable: false,
  },
  contractInputsValues: {
    to: recipientAddress,
    amount: parseUnits(amount, parseInt(erc20.decimals.toString())).toString(),
  }
});

const parse = (csv: string) => {
  const headerDetected = !csv.startsWith("0x");
  const { data } = Papa.parse<[string, string]>(csv, { skipEmptyLines: true });
  if (headerDetected) data.shift();
  return data;
};

const buildTransactions = (erc20: ERC20 | null, rows: [string, string][]) => {
  if (erc20) {
    return rows.map(([recipientAddress, amount]) =>
      buildERC20Transaction(erc20, recipientAddress, amount)
    );
  }
  return rows.map(([recipientAddress, amount]) =>
    buildNativeTransaction(recipientAddress, amount)
  );
};

const createBatchJson = (file: File, erc20: ERC20 | null) => {
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
      const transactions = buildTransactions(erc20, rows);

      const batchJson = TxBuilder.batch(safeAddress, transactions, {
        chainId: 13371,
      });

      resolve(batchJson);
    };

    reader.readAsText(file);
  });
};

export default function Home() {
  const [csvFile, setCsvFile] = useState<File | null>();
  const [erc20, setErc20] = useState<ERC20|null>(null);

  const handleErc20AddressChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.value) {
      setErc20(null);
      return;
    }

    const contract = newErc20Contract(e.target.value);
    const [decimals, symbol] = await Promise.all([
      contract.decimals() as Promise<BigInt>,
      contract.symbol() as Promise<string>,
    ]);
    console.log({decimals, symbol})
    setErc20({ address: e.target.value, decimals: decimals, symbol});
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    setCsvFile(e.target.files[0]);
  };

  const handleClick = () => {
    if (!csvFile) return;
    createBatchJson(csvFile, erc20).then((file) => {
      const blob = decodeURIComponent(encodeURIComponent(JSON.stringify(file, null, 2)));
      const url = window.URL.createObjectURL(new Blob([blob]));
      const link = document.createElement("a");
      link.href = url;
      link.download = "batch.json";
      document.body.appendChild(link);

      link.click();

      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
  });
  };

  return (
    <main className="flex min-h-screen max-w-96 flex-col p-4 gap-4">
      <label>ERC20 Address (blank for native IMX)</label>
      <input
        type="text"
        placeholder="0x"
        onChange={handleErc20AddressChange}
        className="w-full"
      />

      {erc20 ? <div>Detected: {erc20.symbol} / {erc20.decimals.toString()} decimals</div> : <div>Using Native IMX</div>}
      <label>CSV of the form: walletAddress,amount</label>
      <input onChange={handleFileChange} type="file" accept="text/csv" />
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
