const { ethers } = require("ethers");
const Web3 = require("web3");

const newTokens = [];
const maxWaitingTime = 24 * 60 * 60 * 1000; // 24 hr

const providerUrl = "wss://ethereum-sepolia.core.chainstack.com/f162c5698eb9edfd934f5d3c7e0adb4b";
const ethersProvider = new ethers.providers.WebSocketProvider(providerUrl);
const web3 = new Web3(providerUrl);

const ERC20_ABI = [
    "function totalSupply() external view returns (uint256)",
    "function balanceOf(address owner) external view returns (uint256)",
    "function transfer(address to, uint256 amount) external returns (bool)",
    "function approve(address spender, uint256 amount) external returns (bool)"
];

const UNISWAP_ROUTER_ABI = [
    "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) payable returns (uint[] memory amounts)"
];

const UNISWAP_FACTORY_ADDRESS = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
const UNISWAP_ROUTER_ADDRESS = "0x7a250d5630b4cf539739df2c5dacabed4aa42db"; 

const uniswapRouter = new ethers.Contract(UNISWAP_ROUTER_ADDRESS, UNISWAP_ROUTER_ABI, ethersProvider.getSigner());

const walletAddress = 0x00;
const privateKey = "....";

const wallet = new ethers.Wallet(privateKey, ethersProvider);


async function handleNewBlock(blockNumber) {
    console.log(`New block: ${blockNumber}`);

    
    const block = await ethersProvider.getBlockWithTransactions(blockNumber);

    
    for (const tx of block.transactions) {
       
        const receipt = await web3.eth.getTransactionReceipt(tx.hash);

        
        if (receipt.contractAddress) {
            console.log(`Contract deployed at: ${receipt.contractAddress}`);

            // Check if it's an ERC-20 token by calling some of the functions from the ERC-20 interface
            const contract = new ethers.Contract(receipt.contractAddress, ERC20_ABI, ethersProvider);
            try {
                await contract.totalSupply();
                console.log(`New ERC-20 token deployed: ${receipt.contractAddress}`);
                newTokens.push(receipt.contractAddress);
            } catch (error) {
                console.log(`Contract ${receipt.contractAddress} is not a valid ERC-20 token.`);
            }
        }
    }
}


async function checkLiquidityForTokens() {
    console.log("Checking liquidity for tokens...");
    const factory = new ethers.Contract(UNISWAP_FACTORY_ADDRESS, UNISWAP_FACTORY_ABI, ethersProvider);

    for (const tokenAddress of newTokens) {
        console.log(`Checking liquidity for token: ${tokenAddress}`);

        
        const pairAddress = await factory.getPair(ethers.constants.AddressZero, tokenAddress);

        if (pairAddress && pairAddress !== ethers.constants.AddressZero) {
            console.log(`Liquidity pool found for token: ${tokenAddress} at pair: ${pairAddress}`);

            // Check if liquidity has been added (by checking the balance in the pair)
            const pairContract = new ethers.Contract(pairAddress, UNISWAP_PAIR_ABI, ethersProvider);
            const reserves = await pairContract.getReserves();

            if (reserves[0].gt(0) && reserves[1].gt(0)) {
                console.log(`Liquidity available for token: ${tokenAddress}`);
                await buyToken(tokenAddress); 
            } else {
                console.log(`No liquidity added yet for token: ${tokenAddress}`);
            }
        } else {
            console.log(`No liquidity pool found for token: ${tokenAddress}`);
        }
    }
}


async function buyToken(tokenAddress) {
    const amountOutMin = 0; 
    const ethAmount = ethers.utils.parseEther("0.1"); 
    const path = [ethers.constants.AddressZero, tokenAddress]; // ETH -> Token
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from now

    console.log(`Attempting to buy token: ${tokenAddress} with 0.1 ETH...`);

    const tx = await uniswapRouter.swapExactETHForTokens(
        amountOutMin,
        path,
        walletAddress,
        deadline,
        {
            value: ethAmount,
            gasLimit: ethers.utils.hexlify(200000),
            gasPrice: await ethersProvider.getGasPrice() 
        }
    );

    console.log(`Transaction sent: ${tx.hash}`);

    const receipt = await tx.wait();
    console.log(`Transaction confirmed in block: ${receipt.blockNumber}`);
}


async function subscribeToNewBlocks() {
    ethersProvider.on("block", handleNewBlock);
}


setInterval(async () => {
    await checkLiquidityForTokens();
}, 60000); // Every 60 seconds


subscribeToNewBlocks().catch(console.error);

