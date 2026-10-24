-- PEG precipitant 정규화
-- 주요 변종을 표준 이름으로 통일

-- PEG 3350 변종
UPDATE kbsi_crystallization SET precipitant_type = 'PEG 3350' WHERE precipitant_type IN ('PEG-3350', 'PEG 3,350', 'PEG3350', 'PEG 3.350', 'PEG 33350', 'PEG 33500', 'PEG 33505', 'PEG 3330', 'PEG 3340', 'PEG3340', 'PEG 3360', 'PEG 3300', 'PEG 3400', 'PEG-3400', 'PEG 3450', 'PEG 3500', 'PEG-3500', 'PEG3500', 'PEG 3550', 'PEG3550', 'PEG 3.35K', 'PEG 3.25K', 'PEG3K', 'PEG 3k', 'PEG3,350', 'PEG-3,350', 'polyethylene glycol (PEG) 3350', 'polyethylene glycol (PEG) 3,350', 'polyethyleneglycol (PEG) 3350', 'polyethylene glycol PEG3350', 'polyethylene glycol 3350 (PEG3350)', 'polyethylene glycol 3350 (PEG 3350)', 'Polyethylene glycol (PEG) 3350', 'Polyethylene Glycol (PEG) 3350', 'PEG 3.35K', 'PEG3.35K', 'Miralax (PEG3350)', 'PEG 3352', 'PEG 3355', 'PEG 43350', 'PEG 3320');

-- PEG 4000 변종
UPDATE kbsi_crystallization SET precipitant_type = 'PEG 4000' WHERE precipitant_type IN ('PEG-4000', 'PEG 4,000', 'PEG4K', 'PEG 4k', 'PEG4k', 'PEG 4 K', 'PEG-4K', 'PEG 113', 'polyethylene glycol (PEG) 4000', 'Polyethylene glycol (PEG) 4000', 'POLYETHYLENE GLYCOL (PEG) 4000', 'PEGF-4000', 'PEG4,000', 'PEG 4.000', 'PEG MW4000', '4K-PEG', 'Poly-Ethylene Glycol (PEG) 4000', 'polyethylene glycol (PEG) 4,000', 'polyethelene glycol (PEG) 4,000');

-- PEG 8000 변종
UPDATE kbsi_crystallization SET precipitant_type = 'PEG 8000' WHERE precipitant_type IN ('PEG-8000', 'PEG 8,000', 'PEG8K', 'PEG 8k', 'PEG8k', 'PEG-8K', 'PEG 8.000', 'PEG_8000', 'polyethylene glycol (PEG) 8000', 'POLYETHYLENE GLYCOL (PEG) 6000', 'polyethyleneglycol (PEG) 8000', 'Polyethylene glycol (PEG) 8000', 'polyethylene glycol (PEG) 8,000', 'polyethylene glycol [PEG] 8000', 'peg8k', 'Peg8k', 'PEG MW 8000');

-- PEG 6000 변종
UPDATE kbsi_crystallization SET precipitant_type = 'PEG 6000' WHERE precipitant_type IN ('PEG-6000', 'PEG 6,000', 'PEG6K', 'PEG 6k', 'PEG6k', 'PEG-6K', 'PEG 6.000', 'PEG 6 K', 'polyethylene glycol (PEG) 6000', 'polyethyleneglycol (PEG) 6000', 'Polyethylene Glycol (PEG) 6000', 'polyethylenglycol (PEG) 6000');

-- PEG 400 변종
UPDATE kbsi_crystallization SET precipitant_type = 'PEG 400' WHERE precipitant_type IN ('PEG-400', 'polyethylene glycol (PEG) 400', 'Polyethylene glycol (PEG) 400', 'POLYETHYLENE GLYCOL (PEG) 400', 'polyethyleneglycol(PEG)400', 'PEG P400');

-- PEG 20000 변종
UPDATE kbsi_crystallization SET precipitant_type = 'PEG 20000' WHERE precipitant_type IN ('PEG 20,000', 'PEG-20000', 'PEG-20,000', 'PEG20K', 'PEG 20k', 'PEG-20K', 'PEG 20 000', 'PEG 20.000', 'PEG 20 K', 'Peg 20K', 'polyethylene glycol (PEG) 20000', 'polyethylene glycol (PEG) 20,000', 'PEG20,000');

-- PEG 10000 변종
UPDATE kbsi_crystallization SET precipitant_type = 'PEG 10000' WHERE precipitant_type IN ('PEG-10000', 'PEG 10,000', 'PEG10K', 'PEG 10k', 'PEG10k', 'PEG-10,000', 'PEG-10K', 'PEG 10 K', 'PEG 10.000', 'polyethylene glycol (PEG) 10,000', 'polyethylene glycol (PEG) 10000');

-- PEG 1000 변종
UPDATE kbsi_crystallization SET precipitant_type = 'PEG 1000' WHERE precipitant_type IN ('PEG-1000', 'PEG 1,000', 'PEG 1K', 'PEG1K', 'PEG 1k', 'PEG1k', 'polyethylene glycol (PEG) 1000', 'PEG1000H');

-- PEG 1500 변종
UPDATE kbsi_crystallization SET precipitant_type = 'PEG 1500' WHERE precipitant_type IN ('PEG-1500', 'PEG 1,500', 'PEG 1.500', 'PEG 1.5K', 'polyethylene glycol (PEG) 1500', 'Polyethylene glycol (PEG) 1500', 'Polyethylene Glycol (PEG) 1500', 'Peg1500');

-- PEG 2000 변종
UPDATE kbsi_crystallization SET precipitant_type = 'PEG 2000' WHERE precipitant_type IN ('PEG-2000', 'PEG 2,000', 'PEG 2K', 'PEG2K', 'PEG-2K', 'PEG 2.000', 'Peg 2000', 'polyethylene glycol (PEG) 2000');

-- PEG 5000 변종
UPDATE kbsi_crystallization SET precipitant_type = 'PEG 5000' WHERE precipitant_type IN ('PEG-5000', 'PEG 5,000', 'PEG 5K', 'PEG5K', 'PEG 5k', 'PEG-5K', 'polyethylene glycol (PEG) 5000');

-- PEG 3000 변종
UPDATE kbsi_crystallization SET precipitant_type = 'PEG 3000' WHERE precipitant_type IN ('PEG-3000', 'PEG 3,000', 'PEG3K', 'PEG-3,000', 'polyethylene glycol (PEG) 3000');

-- PEG 200 변종
UPDATE kbsi_crystallization SET precipitant_type = 'PEG 200' WHERE precipitant_type IN ('PEG-200', 'PEG#200', 'polyethylene glycol (PEG) 200');

-- PEG 300 변종
UPDATE kbsi_crystallization SET precipitant_type = 'PEG 300' WHERE precipitant_type IN ('PEG-300', 'polyethylene glycol (PEG) 300', 'polyethylene glycol 300 (PEG-300)');

-- PEG 600 변종
UPDATE kbsi_crystallization SET precipitant_type = 'PEG 600' WHERE precipitant_type IN ('PEG-600');

-- PEG MME 2000 변종
UPDATE kbsi_crystallization SET precipitant_type = 'PEG MME 2000' WHERE precipitant_type IN ('PEG 2000 MME', 'PEG2000 MME', 'PEG 2000MME', 'PEG2000MME', 'MPEG 2000', 'MPEG2000', 'PEG-MME 2000', 'PEG-2000 MME', 'PEGMME2000', 'PEGMME 2000', 'PEG 2K MME', 'PEG 2K-MME', 'PEG2K MME', 'PEG2KMME', 'PEG-2KMME', 'PEG2kMME', 'MPEG 2K', 'MPEG 2k', 'MPEG2K', 'MEPEG 2000', 'MEPEG2000', 'MEPEG 2K', 'MEPEG2K', 'PEG monomethyl ether 2000', 'PEG 2000 monomethyl ether', 'PEG 2000 monomethylether', 'PEG2000 monomethylether', 'PEG monomethylether 2000', 'monomethyl ether PEG 2000', 'monomethylether PEG 2000', 'MONOMETHYLETHER PEG 2000', 'MONOMETHYL ETHER PEG 2000', 'PEG 2000 MONOMETHYL ETHER', 'PEG 2000 MONOMETHYLETHER', 'PEG Monomethyl ether 2000', 'PEG Monomethylether 2000', 'PEG Monomethyl Ether 2000', 'PEG Monomethyl 2000', 'MMEPEG 2000', 'MMEPEG2000', 'MME PEG 2000', 'MME PEG2000', 'MME-PEG 2000', 'mPEG 2000', 'mPEG 2K', 'mPEG 2k', 'MePEG 2000', 'MePEG2000', 'PEGmme2000', 'PEGmme2K', 'PEGMMe', 'PEGMME 2K', 'PEGMME2K', 'PEG MM 2k', 'PEG mme 2000', 'PEG 2000mme', 'PEG 2.000 MME', 'PEG2000-MME', 'PEG 2000-MME', 'PEG-MME-2000', 'PEG-MME 2K', 'PEG-MME2000', 'PEG 2KMME', 'PEG_MME_2000', 'PEGME 2,000', 'PEGME 2000', 'PEG ME 2000', 'PEG 2000 MMe', 'PEG 2000 ME', 'PEG 2KME', 'Methyl-ether PEG2000', 'methylethyl PEG 2000', 'methyl ether PEG 2000', 'MethylPEG2000', 'ME2K PEG', 'ME2KPEG', 'POLY(ETHYLENE GLYCOL) (PEG) 2000 MONOMETHYL ETHER', 'poly(ethylene glycol) (PEG) 2000 monomethyl ether', 'poly-ethylene glycol 2000 monomethyl ether (PEG mmE 2000)', 'polyethylene glycol monomethyl ether (PEG MME) 2000', 'Polyethylene glycol monomethyl ether (PEG MME) 2000', 'polyethylene glycol monomethyl ether (PEG) 2000', 'polyethylene glycol (PEG) monomethyl ether (MME) 2k', 'POLYETHYLENE GLYCOL (PEG) 2000 MONOMETHYL ETHER', 'PEG 2000 MONOETHYL ETHER', 'PEG2000 MONOMETHYL ETHER', 'monomethyl ether PEG2000', 'PEG2000 monomethyl ether', 'PEG2000 monomethylester', 'mmePEG 2000', 'PEG 2000 mono methyl ether', 'PEG 2000 mono-methyl-ether', 'PEG-2000 methylether', 'PEG monomethyl ether 2,000', 'PEG 2000 monomethylethyer (MME)', 'PEGMME 2,000', 'PEG 2000MM', 'PEG-ME 2000', 'PEGME2000', 'PEGMMES 2000', 'PEG MONOMETHYLETHER 2000', 'PEG MONOMETHYL ETHER 2000', 'PEGMM 2000', 'mmPEG500', 'MPEG-2000', 'Mpeg 2K', 'PEG MME 2,000', 'PEG MME2000', 'PEG MME 2K', 'PEG MME2K', 'PEG MME-2000', 'PEG 2000 mme', '2000 monomethylether');

-- PEG MME 5000 변종
UPDATE kbsi_crystallization SET precipitant_type = 'PEG MME 5000' WHERE precipitant_type IN ('PEG 5000 MME', 'PEG5000 MME', 'PEG 5000MME', 'PEG5000MME', 'MPEG 5000', 'MPEG5000', 'MPEG 5K', 'PEG-MME 5000', 'PEG-5000 MME', 'PEGMME5000', 'PEGMME 5000', 'PEGMME 5K', 'PEGMME5K', 'PEG 5K MME', 'PEG5K MME', 'PEG5KMME', 'PEG-5000-MME', 'PEG-5000 monomethylether', 'PEG 5000 monomethyl ether', 'PEG 5000 monomethylether', 'PEG5000 Monomethylether', 'PEG5000 Monomethyl ether', 'PEG5000 monomethyl ether', 'PEG monomethyl ether 5000', 'PEG monomethylether 5000', 'PEG Monomethylether 5000', 'PEG Monomethyl Ether 5000', 'MONOMETHYL ETHER PEG 5000', 'PEG 5000 MONOMETHYL ETHER', 'PEG MONOMETHYL ETHER 5000', 'PEG MONOMETHYLETHER 5000', 'MePEG 5000', 'MePEG5000', 'MePEG5K', 'MEPEG 5000', 'MEPEG 5K', 'MEPEG5K', 'mPEG 5000', 'mPEG5000', 'Mpeg 5000', 'Mpeg 5K', 'PEGmme 5000', 'PEGmme5000', 'PEG mme 5000', 'PEGME 5000', 'PEGME5,000', 'PEG ME 5000', 'PEG 5000 ME', 'PEG 5000 methyl ether', 'PEG 5000 (Methyl Ether)', 'PEG5000-MME', 'PEG 5000-MME', 'PEG 5KMME', 'PEG 5kMME', 'PEG5K-MME', 'PEG5KMME', 'PEG5Kmme', 'PEG5k MME', 'PEG-5000-OMe', 'PEG5000-OMe', 'PEG MME 5K', 'PEG MME 5k', 'PEG MME5000', 'PEG MME-5000', 'PEG-MME 5,000', 'PEG-MME 5K', 'MMEPEG 5K', 'MMEPEG 5000', 'MMEPEG5000', 'MME PEG 5000', 'MME PEG5000', 'MME PEG 5K', 'MME-PEG 5000', 'MME-PEG5000', 'MONOMETHYL PEG 5000', 'monomethyl ether PEG 5000', 'monomethyl ether PEG5000', 'monomethylether PEG 5000', 'Monomethylether PEG5K', 'methylether PEG-5000', 'methylether-PEG 5000', 'methylether-PEG-5000', 'PEG 5,000 MME', 'PEG 5000 monomethyl-ether', 'PEG 5000 monomethylethyl ether', 'PEG 5000 monomethylethyl ether (MME)', 'PEG monoethyl ether 5000', 'PEG, monomethyl ether 5000', 'PEG-5000-O-Methylether', 'PEG-mme 5000', 'PEG-monomethyl ether 5K', 'PEG-mono methylether 5000', 'PEG 5000 Monomethyl Ether', 'Peg 5000 monomethyl ether', 'METHOXY-POLYETHYLENE GLYCOL (MPEG) 5K', 'polyethylene glycol (PEG) 5000 monomethyl ether', 'polyethylene glycol monomethyl ether (PEG) 5000', 'POLYETHYLENE GLYCOL MONOMETHYL ETHERS (PEG MME) 5K', 'mono methyl PEG 5000', 'Monomethyl-PEG 5000', 'M-PEG 5K', 'METHOXY PEG 5K', 'MethoxyPEG 5000', 'methoxy polyethylene glycol (MEPEG) 5000', 'mmPEG5000', 'mmPEG5K', 'mmePeg5000', 'mmePEG 5000', 'PEG monomethyl ether 5,000', 'PEG monomethylether 5,000', 'PEG mme5K', 'PEG mme5000', 'PegMME5K', 'PegMME 5k', 'Peg-MME5000', 'PEG-5000-OMe', 'PEG5000 (methyl ester)', 'PEG 5KME', 'PEG 5K MONOMETHYLETHER', 'PEG 5K MONOMETHYL ETHER', 'PEG5K monomethyl ether', 'Polyethylene glycol 5000 monomethyl ether (PEG 5K MME)', 'mme PEG 5K');

-- PEG MME 550 변종
UPDATE kbsi_crystallization SET precipitant_type = 'PEG MME 550' WHERE precipitant_type IN ('PEG 550 MME', 'PEG550 MME', 'PEG550MME', 'PEG 550MME', 'PEG-550 MME', 'PEG-MME 550', 'PEG-MME550', 'PEGMME 550', 'PEGMME550', 'PEG 550 monomethyl ether', 'PEG 550 monomethylether', 'PEG 550 Monomethyl ether', 'PEG monomethyl ether 550', 'PEG monomethylether 550', 'PEG monomethyl-ether 550', 'peg monomethyl ether 550', 'PEG Monomethyl Ether 550', 'PEG MONOMETHYLETHER-550', 'PEG MONOMETHYL ETHER-550', 'PEG MONOMETHYLETHER 550', 'PEG 550 MMe', 'PEG 550 MONOMETHYLETHER', 'PEG MME550', 'PEG MME-550', 'MPEG550', 'MPEG-550', 'MPEG 550', 'PEG mono-methyl ether 550', 'PEG550 monomethyl ether', 'PEG550mme', 'PEGmme550', 'PEG (MME) 550', 'PEG550-monomethyl ether', 'PEG550-MONOMETHYL ETHER', 'PEG-550ME', 'PEG-550-MME', 'MONOMETHYL PEG 550', 'MME-PEG 550', 'MME-PEG550', 'PEG 550 monoethylether', 'PEG550 monoethylether', 'PEG 550 monomethyl ester', 'PEG (polyethylene glycol) monomethyl ether 550', 'polyethylene glycol (PEG) 550 monomethyl ether (MME)', 'polyethylene glycol (PEG) 550 MME', 'polyethylene glycol monomethyl ether 550 (PEG MME 550)', 'Polyethylene glycol monomethyl ether (PEGMME) 550', 'PEG methyl ether 550', 'PEGME 550', 'PEG ME 550', 'PEG mme 550', 'PEG 550mme', 'peg550mme', 'PegMME550', 'PEGMME550');
